import { NextRequest, NextResponse } from 'next/server';
import { KakobuyScraper } from '@/lib/scrapers/KakobuyScraper';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    const scraper = new KakobuyScraper();
    const result = await scraper.scrape(url);
    await scraper.close();

    return NextResponse.json(result);
  } catch (error) {
    console.error('API Scraper Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
