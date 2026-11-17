"use client"

import { useState } from "react"
// import { FormEvent, useState } from "react";
 import {
   ArrowRight,
   CheckCircle2,
  Eye,
   EyeOff,
 FileSearch,
   LockKeyhole,
   Mail,
   ShieldCheck,
   Sparkles,
   TrendingUp,
   WalletCards,
   RefreshCw,
 } from "lucide-react";
 import { Button } from "@/components/ui/button";
import { ErrorModal } from "@/components/ui/error-modal";

 interface AdLoginProps {
   onContinue: (user: {
     id: string;
     username: string;
     name: string;
     email: string;
     role: "user" | "admin";
     status: "active" | "suspended";
   }) => void;
 }

export  function AdLogin({ onContinue }: AdLoginProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false);
// const [error, setError] = useState<string | null>(null);

  const API_URL = "/api/auth/login"

  const features = [
  { icon: FileSearch, title: "Quick analysis", detail: "Clear statement insights in seconds", color: "bg-[#183238]" },
  { icon: ShieldCheck, title: "AD authenticated", detail: "Sign in with your organization account", color: "bg-emerald-500" },
  { icon: TrendingUp, title: "Smarter decisions", detail: "Understand your cash flow at a glance", color: "bg-violet-500" },
  { icon: WalletCards, title: "Bank-ready reports", detail: "Review every statement in one place", color: "bg-amber-500" },
];

const handleDevBypass = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/dev-session", { method: "POST" });
      const result = (await response.json()) as {
        user?: {
          id: string;
          username: string;
          name: string;
          email: string;
          role: "user" | "admin";
          status: "active" | "suspended";
        };
        message?: string;
      };
      if (!response.ok || !result.user) {
        throw new Error(result.message || "Could not start the local development session.");
      }
      onContinue(result.user);
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Could not start the local development session."
      );
    } finally {
      setIsLoading(false);
    }
  };


  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = (await response.json()) as {
        responseCode?: string;
        responseMessage?: string;
        user?: {
          id: string;
          username: string;
          name: string;
          email: string;
          role: "user" | "admin";
          status: "active" | "suspended";
        };
      };

      if (!response.ok || data.responseCode !== "00" || !data.user) {
        setError(data.responseMessage || "Invalid username or password")
        setLoading(false)
        return
      }

      onContinue(data.user)
    } catch (err) {
      console.error("Sign-in error:", err)
      setError("Connection failed. Please check your network and try again.")
      setLoading(false)
    }
  }
  

  // return (
  //   <div className="min-h-screen w-full bg-[#f3f6f4] flex items-center justify-center p-4 sm:p-6 lg:p-8">
  //     {/* Main Container Card matching the design */}
  //     <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[580px]">
        
  //       {/* Left Section - Hero Brand Panel */}
  //       <div className="relative md:w-1/2 bg-[#023c2a] text-white p-8 md:p-12 flex flex-col justify-between overflow-hidden">
  //         {/* Background image overlay */}
  //         <div 
  //           className="absolute inset-0 bg-cover bg-center  pointer-events-none"
  //            style={{ backgroundImage: `url('/bg.png')` }}
  //         />
  //         <div className="absolute inset-0 bg-gradient-to-t from-[#012519] via-transparent to-[#023c2a]/60 pointer-events-none" />

  //         {/* Top Branding */}
  //         <div className="relative z-10">
  //           <div className="flex items-center gap-3">
  //             {/* Adspire Chevron / Delta Icon */}
  //             <div className="w-30 h-9 flex items-center justify-center">
  //               <img src='adspire-logo.png' alt="Adspire Logo"  />
  //             </div>
  //             {/* <span className="text-2xl font-bold tracking-tight text-white">Adspire</span> */}
  //           </div>
  //           <p className="text-xs text-emerald-200/80 font-normal mt-0.5 ml-12">
  //             {/* Dashboard &amp; Reporting Portal */}
  //           </p>
  //         </div>

  //         {/* Bottom Heading & Subtext */}
  //         <div className="relative z-10 mt-24 md:mt-0">
  //           <h1 className="text-3xl sm:text-4xl font-semibold leading-tight text-white tracking-tight">
  //             Insight today.
  //             <br />
  //             Better decisions tomorrow.
  //           </h1>
  //           <p className="text-xs sm:text-sm text-emerald-100/75 mt-3 max-w-sm font-normal">
  //             Monitor performance, investigate transactions and act with confidence.
  //           </p>
  //         </div>
  //       </div>

  //       {/* Right Section - Login Form */}
  //       <div className="w-full md:w-1/2 bg-white px-8 py-10 md:px-14 flex flex-col justify-between">
  //         <div className="w-full max-w-sm mx-auto my-auto space-y-6">
            
  //           {/* Header */}
  //           <div className="text-center space-y-1.5">
  //             <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
  //               Welcome back
  //             </h2>
  //             <p className="text-xs sm:text-sm text-gray-500">
  //               Sign in with your Advans credentials to continue.
  //             </p>
  //           </div>

  //           {/* Form */}
  //           <form onSubmit={handleSignIn} className="space-y-4 pt-2">
  //             {/* Email Field */}
  //             <div className="space-y-1.5 text-left">
  //               <label className="block text-xs font-semibold text-gray-800">
  //                 Email address
  //               </label>
  //               <input
  //                 type="text"
  //                 required
  //                 placeholder="Enter your email address"
  //                 value={username}
  //                 onChange={(e) => setUsername(e.target.value)}
  //                 className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700 transition"
  //               />
  //             </div>

  //             {/* Password Field */}
  //             <div className="space-y-1.5 text-left">
  //               <label className="block text-xs font-semibold text-gray-800">
  //                 Password
  //               </label>
  //               <div className="relative">
  //                 <input
  //                   type={showPassword ? "text" : "password"}
  //                   required
  //                   placeholder="•••••••••"
  //                   value={password}
  //                   onChange={(e) => setPassword(e.target.value)}
  //                   className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700 transition pr-10"
  //                 />
  //                 <button
  //                   type="button"
  //                   onClick={() => setShowPassword(!showPassword)}
  //                   className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
  //                   aria-label="Toggle password visibility"
  //                 >
  //                   {showPassword ? (
  //                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  //                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
  //                     </svg>
  //                   ) : (
  //                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  //                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  //                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  //                     </svg>
  //                   )}
  //                 </button>
  //               </div>
  //             </div>

  //             {/* Forgot Password Link */}
  //             <div className="flex justify-end pt-0.5">
  //               <a
  //                 href="/forgot-password"
  //                 className="text-xs font-medium text-emerald-800 hover:text-emerald-900 transition"
  //               >
  //                 Forgot password?
  //               </a>
  //             </div>

  //             {/* Submit Button */}
  //             <button
  //               type="submit"
  //               disabled={loading}
  //               className="w-full mt-2 py-2.5 px-4 bg-[#0a4834] hover:bg-[#073627] text-white font-medium text-sm rounded-lg shadow-sm transition duration-150 disabled:opacity-70 cursor-pointer"
  //             >
  //               {loading ? "Logging in..." : "Log in"}
  //             </button>
  //           </form>

  //           {error && (
  //             <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-md text-center">
  //               {error}
  //             </div>
  //           )}
  //         </div>

  //         {/* Footer Subtext */}
  //         <div className="text-center space-y-0.5 text-[11px] text-gray-500 mt-6">
  //           <p>Powered by Advans.</p>
  //           <p>Licensed by the Central Bank of Nigeria.</p>
  //         </div>
  //       </div>

  //     </div>
  //   </div>
  // )


  return (
    <main className="min-h-screen bg-[#f3f7fc] p-3 sm:p-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-[1440px] overflow-hidden rounded-[28px] bg-white shadow-[0_24px_90px_rgba(24,50,56,0.14)] lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[0.88fr_1.12fr]">
        <section className="relative isolate overflow-hidden bg-[#183238] px-7 py-8 text-white sm:px-12 sm:py-11 lg:px-14 lg:py-12">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_5%,rgba(217,243,107,0.18),transparent_35%),linear-gradient(145deg,#183238_0%,#224a52_52%,#102d35_100%)]" />
          <div className="absolute -bottom-36 -right-28 -z-10 h-96 w-96 rounded-full border-[50px] border-[#D9F36B]/10" />

           {/* <div className="flex items-center gap-3">
             <div className="flex h-12 w-12 items-end gap-1 rounded-xl bg-white/10 p-2.5">
               <span className="h-4 w-2 rounded-sm bg-teal-300" />
              <span className="h-6 w-2 rounded-sm bg-cyan-300" />
              <span className="h-8 w-2 rounded-sm bg-blue-400" />
            </div>
             <div className="text-[21px] font-bold leading-none tracking-tight">
               Statement
               <span className="block pt-1 text-cyan-300">Analyzer</span>
             </div>
           </div> */}
           <div className="flex items-center gap-3">
                       <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[#F9FBFA] shadow-sm ring-1 ring-white/10">
                         <img src="/logo.png" alt="Statement Analyzer logo" className="h-7 w-7 object-contain" />
                       </div>
                       <div>
                         <p className="text-sm font-semibold tracking-tight text-[#F9FBFA]">
                           Statement Analyzer &amp; Underwriter
                         </p>
                         <p className="text-[11px] uppercase tracking-[0.18em] text-[#F9FBFA]/70">
                           Fintech &amp; Lending Intelligence
                         </p>
                       </div>
                     </div>

           <div className="mt-10 max-w-xl sm:mt-14">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#D9F36B]/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-[#F9FBFA]">
               <Sparkles className="h-3.5 w-3.5 text-[#D9F36B]" />
               Financial clarity starts here
             </span>
             <h1 className="mt-5 text-3xl font-bold leading-[1.12] tracking-tight sm:text-4xl">
               Turn your bank statements into{" "}
               <span className="text-[#D9F36B]">real insights.</span>
             </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[#F9FBFA]/80 sm:text-base">
              Upload a statement, understand your cash flow, and review your analysis outcomes.
             </p>
           </div>

           <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, detail, color }) => (
               <div key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-sm">                 <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
                   <Icon className="h-5 w-5" />
                 </span>
                 <span className="pt-0.5">
                   <span className="block text-sm font-semibold">{title}</span>
                  <span className="mt-1 block text-xs leading-4 text-[#F9FBFA]/70">{detail}</span>
                 </span>
               </div>
             ))}
           </div>

           <div className="mt-9 flex items-center gap-2 text-xs text-[#F9FBFA]/80 sm:mt-12">
             <CheckCircle2 className="h-4 w-4 text-[#D9F36B]" />
             No bank login details required
           </div>
          <div className="mt-12 hidden items-center gap-3 text-xs text-[#F9FBFA]/70 lg:flex">
             <span className="h-px w-10 bg-[#D9F36B]/60" />
             Better insights. Brighter financial future.
           </div>
         </section>

        <section className="flex items-center justify-center px-5 py-9 sm:px-10 lg:px-14">
           <div className="w-full max-w-[460px]">
             <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-[#183238]/15 bg-[#F9FBFA] px-3 py-1 text-[11px] font-semibold text-[#183238]">
               <Sparkles className="h-3 w-3 text-[#183238]" />
               ACTIVE DIRECTORY
             </div>
             <div className="text-center">
              

             <div className="relative mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-[#183238] shadow-sm ring-1 ring-[#183238]/10">
               <img src="/logo.png" alt="Statement Analyzer logo" className="h-9 w-9 object-contain" />
             </div>
              
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#102d55]">
                Welcome back
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-5 text-slate-500">
                Sign in with your organization Active Directory account to continue.
              </p>
          </div>

            <form className="mt-8 space-y-4" onSubmit={handleSignIn}>
              <label className="block text-sm font-semibold text-slate-700" htmlFor="demo-email">                Username or work email
                 <span className="mt-1.5 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm focus-within:border-[#183238] focus-within:ring-4 focus-within:ring-[#183238]/10">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <input
                    id="demo-email"
                     type="text"
                  autoComplete="username"
                   required
                   value={username}
                   onChange={(e) => setUsername(e.target.value)}
                  //   value={email}
                  //  onChange={(event) => setEmail(event.target.value)}
                   placeholder="Enter your AD username or email"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal outline-none placeholder:text-slate-400"
                  />
                 </span>
              </label>

              <label className="block text-sm font-semibold text-slate-700" htmlFor="demo-password">
                 Password
                 <span className="mt-1.5 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm focus-within:border-[#183238] focus-within:ring-4 focus-within:ring-[#183238]/10">
                  <LockKeyhole className="h-4 w-4 text-slate-400" />
                  <input
                 type={showPassword ? "text" : "password"}
                   autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                     placeholder="Enter your AD password"
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal outline-none placeholder:text-slate-400"
                 />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                   {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
               </span>
             </label>

              <ErrorModal
                open={Boolean(error)}
                onOpenChange={(open) => !open && setError(null)}
                title="Sign-in failed"
                message={error}
              />

              <Button
                 type="submit"
                 disabled={isLoading}
                 className="h-12 w-full rounded-xl bg-gradient-to-r from-[#183238] via-[#183238] to-[#224a52] text-sm font-semibold text-white shadow-lg shadow-[#183238]/20 hover:from-[#224a52] hover:to-[#183238]"
             >
               {isLoading ? "Verifying AD credentials..." : "Sign in with Active Directory"}
               <ArrowRight className="ml-2 h-4 w-4" />
             </Button>
            </form>

            {process.env.NODE_ENV !== "production" && (
              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={handleDevBypass}
                className="mt-3 h-11 w-full rounded-xl"
              >
              {isLoading ? "Starting local session..." : "Continue without AD (local development)"}
             </Button>
           )}

           

            <p className="mt-5 rounded-xl bg-slate-50 px-3.5 py-3 text-center text-[11px] leading-4 text-slate-500">
             Your password is checked by your organization&apos;s directory and is not saved in this application.
            </p>
            <div className="mt-7 flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <LockKeyhole className="h-3.5 w-3.5" />
              Secure server session · Your organization login
            </div>
          </div>
        </section>
      </div>
    </main>
   );
}

// "use client";

// import { FormEvent, useState } from "react";
// import {
//   ArrowRight,
//   CheckCircle2,
//   Eye,
//   EyeOff,
//   FileSearch,
//   LockKeyhole,
//   Mail,
//   ShieldCheck,
//   Sparkles,
//   TrendingUp,
//   WalletCards,
// } from "lucide-react";
// import { Button } from "@/components/ui/button";

// interface AdLoginProps {
//   onContinue: (user: {
//     id: string;
//     username: string;
//     name: string;
//     email: string;
//     role: "user" | "admin";
//     status: "active" | "suspended";
//   }) => void;
// }

// const features = [
//   { icon: FileSearch, title: "Quick analysis", detail: "Clear statement insights in seconds", color: "bg-blue-500" },
//   { icon: ShieldCheck, title: "AD authenticated", detail: "Sign in with your organization account", color: "bg-emerald-500" },
//   { icon: TrendingUp, title: "Smarter decisions", detail: "Understand your cash flow at a glance", color: "bg-violet-500" },
//   { icon: WalletCards, title: "Bank-ready reports", detail: "Review every statement in one place", color: "bg-amber-500" },
// ];

// export function AdLogin({ onContinue }: AdLoginProps) {
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [showPassword, setShowPassword] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
//     event.preventDefault();
//     if (!email.trim() || !password) return;
//     setIsLoading(true);
//     setError(null);
//     try {
//       const response = await fetch("/api/auth/login", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ username: email.trim(), password }),
//       });
//       const result = (await response.json()) as {
//         user?: {
//           id: string;
//           username: string;
//           name: string;
//           email: string;
//           role: "user" | "admin";
//           status: "active" | "suspended";
//         };
//         message?: string;
//       };
//       if (!response.ok || !result.user) {
//         throw new Error(result.message || "Could not sign in. Check your credentials and try again.");
//       }
//       setPassword("");
//       onContinue(result.user);
//     } catch (loginError) {
//       setError(
//         loginError instanceof Error
//           ? loginError.message
//           : "Could not sign in. Check your connection and try again."
//       );
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleDevBypass = async () => {
//     setIsLoading(true);
//     setError(null);
//     try {
//       const response = await fetch("/api/auth/dev-session", { method: "POST" });
//       const result = (await response.json()) as {
//         user?: {
//           id: string;
//           username: string;
//           name: string;
//           email: string;
//           role: "user" | "admin";
//           status: "active" | "suspended";
//         };
//         message?: string;
//       };
//       if (!response.ok || !result.user) {
//         throw new Error(result.message || "Could not start the local development session.");
//       }
//       onContinue(result.user);
//     } catch (loginError) {
//       setError(
//         loginError instanceof Error
//           ? loginError.message
//           : "Could not start the local development session."
//       );
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   return (
//     <main className="min-h-screen bg-[#f3f7fc] p-3 sm:p-6 lg:p-8">
//       <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-[1440px] overflow-hidden rounded-[28px] bg-white shadow-[0_24px_90px_rgba(16,48,91,0.14)] lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[0.88fr_1.12fr]">
//         <section className="relative isolate overflow-hidden bg-[#092b59] px-7 py-8 text-white sm:px-12 sm:py-11 lg:px-14 lg:py-12">
//           <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_5%,rgba(14,165,233,0.35),transparent_35%),linear-gradient(145deg,#0b3972_0%,#062755_52%,#031b3d_100%)]" />
//           <div className="absolute -bottom-36 -right-28 -z-10 h-96 w-96 rounded-full border-[50px] border-blue-300/10" />

//           <div className="flex items-center gap-3">
//             <div className="flex h-12 w-12 items-end gap-1 rounded-xl bg-white/10 p-2.5">
//               <span className="h-4 w-2 rounded-sm bg-teal-300" />
//               <span className="h-6 w-2 rounded-sm bg-cyan-300" />
//               <span className="h-8 w-2 rounded-sm bg-blue-400" />
//             </div>
//             <div className="text-[21px] font-bold leading-none tracking-tight">
//               Statement
//               <span className="block pt-1 text-cyan-300">Analyzer</span>
//             </div>
//           </div>

//           <div className="mt-10 max-w-xl sm:mt-14">
//             <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-cyan-100">
//               <Sparkles className="h-3.5 w-3.5" />
//               Financial clarity starts here
//             </span>
//             <h1 className="mt-5 text-3xl font-bold leading-[1.12] tracking-tight sm:text-4xl">
//               Turn your bank statements into{" "}
//               <span className="text-cyan-300">real insights.</span>
//             </h1>
//             <p className="mt-4 max-w-lg text-sm leading-6 text-blue-100/80 sm:text-base">
//               Upload a statement, understand your cash flow, and review your analysis outcomes.
//             </p>
//           </div>

//           <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2">
//             {features.map(({ icon: Icon, title, detail, color }) => (
//               <div key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-sm">
//                 <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
//                   <Icon className="h-5 w-5" />
//                 </span>
//                 <span className="pt-0.5">
//                   <span className="block text-sm font-semibold">{title}</span>
//                   <span className="mt-1 block text-xs leading-4 text-blue-100/70">{detail}</span>
//                 </span>
//               </div>
//             ))}
//           </div>

//           <div className="mt-9 flex items-center gap-2 text-xs text-blue-100/70 sm:mt-12">
//             <CheckCircle2 className="h-4 w-4 text-emerald-300" />
//             No bank login details required
//           </div>
//           <div className="mt-12 hidden items-center gap-3 text-xs text-blue-100/60 lg:flex">
//             <span className="h-px w-10 bg-cyan-300/60" />
//             Better insights. Brighter financial future.
//           </div>
//         </section>

//         <section className="flex items-center justify-center px-5 py-9 sm:px-10 lg:px-14">
//           <div className="w-full max-w-[460px]">
//             <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
//               <Sparkles className="h-3 w-3" />
//               ACTIVE DIRECTORY
//             </div>
//             <div className="text-center">
//               <div className="mx-auto flex h-14 w-14 items-end justify-center gap-1 rounded-2xl bg-blue-50 pb-3">
//                 <span className="h-5 w-2.5 rounded-sm bg-teal-400" />
//                 <span className="h-7 w-2.5 rounded-sm bg-cyan-500" />
//                 <span className="h-9 w-2.5 rounded-sm bg-blue-600" />
//               </div>
//               <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#102d55]">
//                 Welcome back
//               </h2>
//               <p className="mx-auto mt-2 max-w-sm text-sm leading-5 text-slate-500">
//                 Sign in with your organization Active Directory account to continue.
//               </p>
//             </div>

//             <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
//               <label className="block text-sm font-semibold text-slate-700" htmlFor="demo-email">
//                 Username or work email
//                 <span className="mt-1.5 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
//                   <Mail className="h-4 w-4 text-slate-400" />
//                   <input
//                     id="demo-email"
//                     type="text"
//                     autoComplete="username"
//                     required
//                     value={email}
//                     onChange={(event) => setEmail(event.target.value)}
//                     placeholder="Enter your AD username or email"
//                     className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal outline-none placeholder:text-slate-400"
//                   />
//                 </span>
//               </label>

//               <label className="block text-sm font-semibold text-slate-700" htmlFor="demo-password">
//                 Password
//                 <span className="mt-1.5 flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
//                   <LockKeyhole className="h-4 w-4 text-slate-400" />
//                   <input
//                     id="demo-password"
//                     type={showPassword ? "text" : "password"}
//                     autoComplete="current-password"
//                     required
//                     value={password}
//                     onChange={(event) => setPassword(event.target.value)}
//                     placeholder="Enter your AD password"
//                     className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal outline-none placeholder:text-slate-400"
//                   />
//                   <button
//                     type="button"
//                     aria-label={showPassword ? "Hide password" : "Show password"}
//                     onClick={() => setShowPassword((visible) => !visible)}
//                     className="text-slate-400 hover:text-slate-700"
//                   >
//                     {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
//                   </button>
//                 </span>
//               </label>

//               {error && (
//                 <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
//                   {error}
//                 </p>
//               )}

//               <Button
//                 type="submit"
//                 disabled={isLoading}
//                 className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-500 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:from-blue-800 hover:to-blue-600"
//               >
//                 {isLoading ? "Verifying AD credentials..." : "Sign in with Active Directory"}
//                 <ArrowRight className="ml-2 h-4 w-4" />
//               </Button>
//             </form>

//             {process.env.NODE_ENV !== "production" && (
//               <Button
//                 type="button"
//                 variant="outline"
//                 disabled={isLoading}
//                 onClick={handleDevBypass}
//                 className="mt-3 h-11 w-full rounded-xl"
//               >
//                 {isLoading ? "Starting local session..." : "Continue without AD (local development)"}
//               </Button>
//             )}

//             <p className="mt-5 rounded-xl bg-slate-50 px-3.5 py-3 text-center text-[11px] leading-4 text-slate-500">
//               Your password is checked by your organization&apos;s directory and is not saved in this application.
//             </p>
//             <div className="mt-7 flex items-center justify-center gap-2 text-[11px] text-slate-400">
//               <LockKeyhole className="h-3.5 w-3.5" />
//               Secure server session · Your organization login
//             </div>
//           </div>
//         </section>
//       </div>
//     </main>
//   );
// }
