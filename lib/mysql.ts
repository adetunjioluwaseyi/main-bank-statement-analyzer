import mysql, { type Pool, type PoolConnection } from "mysql2/promise";

const globalForMysql = globalThis as typeof globalThis & {
  statementAnalyzerPool?: Pool;
};

function getPool(): Pool {
  if (globalForMysql.statementAnalyzerPool) {
    return globalForMysql.statementAnalyzerPool;
  }

  const required = [
    "MYSQL_HOST",
    "MYSQL_DATABASE",
    "MYSQL_USER",
    "MYSQL_PASSWORD",
  ] as const;
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing MySQL configuration: ${missing.join(", ")}`);
  }

  const port = Number(process.env.MYSQL_PORT || "3306");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MYSQL_PORT must be a valid TCP port.");
  }

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port,
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z",
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  globalForMysql.statementAnalyzerPool = pool;
  return pool;
}

export { getPool };

export async function withMysqlTransaction<T>(
  callback: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
