import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/permissions";
import { getContentType, getUploadRoot } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isInsideBaseDir(baseDir: string, filePath: string) {
  const relativePath = path.relative(baseDir, filePath);
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path: pathSegments } = await params;
  if (!pathSegments?.length || pathSegments.some((segment) => segment.includes("\0"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const baseDir = path.resolve(getUploadRoot());
  const filePath = path.resolve(baseDir, pathSegments.join(path.sep));

  if (!isInsideBaseDir(baseDir, filePath)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const realBaseDir = fs.realpathSync(baseDir);
    const realFilePath = fs.realpathSync(filePath);

    if (!isInsideBaseDir(realBaseDir, realFilePath) || !fs.statSync(realFilePath).isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(fs.readFileSync(realFilePath), {
      headers: {
        "Content-Type": getContentType(realFilePath),
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
