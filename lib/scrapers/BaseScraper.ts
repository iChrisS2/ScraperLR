import puppeteer, { Browser, Page } from 'puppeteer';
import { ScraperOptions } from '@/types/scraper';

export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected options: ScraperOptions;

  constructor(options: ScraperOptions = {}) {
    this.options = {
      timeout: 30000,
      headless: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      ...options
    };
  }

  protected async createPage(): Promise<Page> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
    }

    const page = await this.browser.newPage();
    
    // Set user agent
    if (this.options.userAgent) {
      await page.setUserAgent(this.options.userAgent);
    }

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    return page;
  }

  protected async extractText(page: Page, selector: string): Promise<string | null> {
    try {
      const element = await page.$(selector);
      if (!element) return null;
      
      const text = await page.evaluate(el => el.textContent?.trim() || '', element);
      return text || null;
    } catch (error) {
      console.log(`Error extracting text with selector "${selector}":`, error);
      return null;
    }
  }

  protected async extractMultipleAttributes(page: Page, selector: string, attribute: string): Promise<string[]> {
    try {
      const elements = await page.$$(selector);
      if (elements.length === 0) return [];

      const values = await Promise.all(
        elements.map(async (element) => {
          const value = await page.evaluate((el, attr) => el.getAttribute(attr), element, attribute);
          return value;
        })
      );

      return values.filter((value): value is string => value !== null);
    } catch (error) {
      console.log(`Error extracting attributes with selector "${selector}":`, error);
      return [];
    }
  }

  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
