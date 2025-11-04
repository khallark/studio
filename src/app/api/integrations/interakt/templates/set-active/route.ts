
// This file has been cleared as part of removing the Interakt integration.
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'This functionality has been removed.' }, { status: 410 });
}
