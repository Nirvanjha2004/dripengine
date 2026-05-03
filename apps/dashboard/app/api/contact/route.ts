import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.API_URL ?? "http://localhost:8000"
const API_KEY = process.env.API_SECRET_KEY ?? ""

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")

  if (!email) {
    return NextResponse.json({ detail: "email is required" }, { status: 400 })
  }

  const res = await fetch(
    `${API_URL}/dashboard/contacts?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${API_KEY}` }, cache: "no-store" }
  )

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}