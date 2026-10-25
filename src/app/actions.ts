"use server";

import { revalidatePath } from "next/cache";
import { deleteNote, insertNote } from "@/lib/db";

export async function addNote(formData: FormData) {
  const body = formData.get("body");
  if (typeof body !== "string" || !body.trim() || body.trim().length > 1000) {
    throw new Error("Write a note between 1 and 1,000 characters.");
  }
  (await insertNote(body.trim()));
  revalidatePath("/notebook");
}

export async function removeNote(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid note ID.");
  (await deleteNote(id));
  revalidatePath("/notebook");
}
