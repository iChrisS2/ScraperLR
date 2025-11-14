import { NextRequest, NextResponse } from 'next/server';
import { KakobuyCrawleeScraper } from '@/lib/scrapers/KakobuyCrawleeScraper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, urls } = body;

    // Aceptar tanto 'url' (single) como 'urls' (array)
    const urlsToScrape = urls || (url ? [url] : []);

    if (!urlsToScrape || urlsToScrape.length === 0) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    const scraper = new KakobuyCrawleeScraper({ headless: true });
    
    try {
      // Si es un solo URL, retornar un solo resultado
      if (urlsToScrape.length === 1) {
        const result = await scraper.scrape(urlsToScrape[0]);
        await scraper.close();
        return NextResponse.json(result);
      }
      
      // Si son múltiples URLs, retornar array de resultados
      const results = await scraper.scrape(urlsToScrape);
      await scraper.close();
      return NextResponse.json(results);
    } catch (scrapeError) {
      await scraper.close();
      console.error('Scraper execution error:', scrapeError);
      throw scrapeError;
    }
  } catch (error) {
    console.error('API Scraper Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
