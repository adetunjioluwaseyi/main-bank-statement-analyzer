import { NextResponse } from "next/server";
import { Client } from "ldapts";
import {
  AuthenticatedUser,
  createSessionToken,
  getSessionExpiry,
  SESSION_COOKIE_NAME,
} from "@/lib/server-session";

// Configuration matching your PHP AD setup
const LDAP_URL = process.env.LDAP_URL || "ldap://NG100ADC01.advans.ad:389";
const LDAP_BASE_DN = process.env.LDAP_BASE_DN || "DC=advans,DC=ad";
const SERVICE_BIND_DN = process.env.LDAP_BIND_DN || "svc.pverify.ng@advans.ad";
const SERVICE_BIND_PW = process.env.LDAP_BIND_PW || "Advansp@552023";

export const runtime = "nodejs";

// Helper function to escape LDAP filter input
function escapeLdapFilter(input: string): string {
  return input.replace(/[\\*()\0]/g, (char) => `\\${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

export async function POST(request: Request) {
  let adminClient: Client | null = null;
  let userClient: Client | null = null;

  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { responseCode: "99", responseMessage: "Username and password are required" },
        { status: 400 }
      );
    }

    // Extract username if user typed an email (e.g., user@advans.ad -> user)
    const cleanUsername = username.includes("@") ? username.split("@")[0] : username;

    // 1. Initialize LDAP admin connection
    adminClient = new Client({
      url: LDAP_URL,
      timeout: 5000,
      connectTimeout: 5000,
    });

    // 2. Service Bind (Admin check)
    try {
      await adminClient.bind(SERVICE_BIND_DN, SERVICE_BIND_PW);
    } catch (bindErr) {
      console.error("[LDAP] Service account bind failed:", bindErr);
      return NextResponse.json(
        { responseCode: "99", responseMessage: "Directory service authentication unavailable" },
        { status: 500 }
      );
    }

    // 3. Search for the user to retrieve their full DN and profile details
    const safeUsername = escapeLdapFilter(cleanUsername);
    const searchFilter = `(sAMAccountName=${safeUsername})`;

    const searchResults = await adminClient.search(LDAP_BASE_DN, {
      scope: "sub",
      filter: searchFilter,
      attributes: ["dn", "givenName", "sn", "mail", "telephoneNumber", "sAMAccountName"],
    });

    if (!searchResults.searchEntries || searchResults.searchEntries.length === 0) {
      await adminClient.unbind();
      return NextResponse.json(
        { responseCode: "01", responseMessage: "Invalid username or password" },
        { status: 401 }
      );
    }

    const userEntry = searchResults.searchEntries[0];
    const userDN = userEntry.dn;

    // Disconnect service client
    await adminClient.unbind();
    adminClient = null;

    // 4. Authenticate User (Attempt to bind with user's DN and their supplied password)
    userClient = new Client({
      url: LDAP_URL,
      timeout: 5000,
      connectTimeout: 5000,
    });

    try {
      await userClient.bind(userDN, password);
    } catch (authErr) {
      console.warn(`[LDAP] Invalid credentials for user: ${cleanUsername}`);
      return NextResponse.json(
        { responseCode: "01", responseMessage: "Invalid username or password" },
        { status: 401 }
      );
    }

    await userClient.unbind();
    userClient = null;

    // 5. Extract user profile information
    const firstName = (userEntry.givenName as string) || "";
    const lastName = (userEntry.sn as string) || "";
    const fullName = `${firstName} ${lastName}`.trim() || cleanUsername;
    const email = (userEntry.mail as string) || `${cleanUsername}@advans.ad`;
    const mobile = (userEntry.telephoneNumber as string) || "";
    const authenticatedUser: AuthenticatedUser = {
      id: `ad:${cleanUsername.toLowerCase()}`,
      username: cleanUsername,
      name: fullName,
      email,
      role: "user",
      status: "active",
    };

    const response = NextResponse.json(
      {
        responseCode: "00",
        responseMessage: "Login successful",
        user: authenticatedUser,
        mobile,
      },
      { status: 200 }
    );
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(authenticatedUser), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: getSessionExpiry(),
    });
    return response;
  } catch (error: any) {
    console.error("[LDAP] Authentication error:", error);

    if (adminClient) {
      try { await adminClient.unbind(); } catch {}
    }
    if (userClient) {
      try { await userClient.unbind(); } catch {}
    }

    return NextResponse.json(
      {
        responseCode: "99",
        responseMessage: "Authentication failed. Please verify network and server access.",
      },
      { status: 500 }
    );
  }
}





// export async function POST(request: Request) {
//   try {
//     console.log("[v0] API proxy received request")

//     const body = await request.json()
//     console.log("[v0] Request body:", body)

//     const externalApiUrl =
//       "http://94.72.111.23:2000/myritewallet/v1/ADMIN/AUTH/ADMIN/LOGIN"
//     console.log("[v0] Forwarding to:", externalApiUrl)

//     const response = await fetch(externalApiUrl, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(body),
//     })

//     console.log("[v0] External API response status:", response.status)

//     const contentType = response.headers.get("content-type")
//     let data

//     if (contentType?.includes("application/json")) {
//       data = await response.json()
//     } else {
//       const text = await response.text()
//       console.error("[v0] Unexpected response:", text)
//       return Response.json(
//         { message: "Unexpected response from server" },
//         { status: response.status }
//       )
//     }

//     console.log("[v0] External API response:", data)

//     if (!response.ok) {
//       return Response.json(
//         { message: data.message || "Invalid username or password" },
//         { status: response.status }
//       )
//     }

//     return Response.json(data, { status: 200 })
//   } catch (error) {
//     console.error("[v0] API proxy error:", error)
//     return Response.json(
//       { message: "Connection failed. Please try again." },
//       { status: 500 }
//     )
//   }
// }
