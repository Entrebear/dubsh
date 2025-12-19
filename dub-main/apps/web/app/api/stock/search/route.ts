import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type StockItem = {
  id: string;
  description: string;
  urls: { full: string; regular: string; small: string; thumb: string };
  user: { name: string; links: { html: string } };
  links: { html: string };
};

const stock = [
  {
    id: "bg-1",
    file: "/stock/bg-1.svg",
    desc: "Gradient Sky",
  },
  {
    id: "bg-2",
    file: "/stock/bg-2.svg",
    desc: "Green Wave",
  },
  {
    id: "bg-3",
    file: "/stock/bg-3.svg",
    desc: "Rose Night",
  },
] as const;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") || "").toLowerCase();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const results: StockItem[] = stock
    .filter((i) =>
      query ? i.id.includes(query) || i.desc.toLowerCase().includes(query) : true,
    )
    .map((i) => {
      const url = `${baseUrl}${i.file}`;
      return {
        id: i.id,
        description: i.desc,
        urls: {
          full: url,
          regular: url,
          small: url,
          thumb: url,
        },
        user: { name: "Local library", links: { html: baseUrl || "" } },
        links: { html: url },
      };
    });

  return NextResponse.json({ results });
}
