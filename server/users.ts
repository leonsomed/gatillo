import type { StatementResultingChanges } from "node:sqlite";
import { useDb } from "./db";

export type AppUser = {
  id: string;
  email: string;
};

export async function getUserByEmail(email: string): Promise<AppUser> {
  return await useDb(async (db) => {
    const op = db.prepare("SELECT id, email FROM users WHERE email = ?");

    return op.get(email) as AppUser;
  });
}

export async function getUserById(id: string): Promise<AppUser> {
  return await useDb(async (db) => {
    const op = db.prepare("SELECT id, email FROM users WHERE id = ?");

    return op.get(id) as AppUser;
  });
}

export async function insertUser(
  user: AppUser,
): Promise<StatementResultingChanges> {
  return await useDb(async (db) => {
    const op = db.prepare("INSERT INTO users (id, email) VALUES (?, ?)");

    return op.run(user.id, user.email);
  });
}
