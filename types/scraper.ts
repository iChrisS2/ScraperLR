export interface ScrapedProduct {
  url: string;
  title: string;
  price: string;
  currency: string;
  platform: string;
  images?: string[];
  seller?: string;
  rating?: number;
  reviews?: number;
  stock?: string;
  description?: string;
}

export interface ScrapingResult {
  success: boolean;
  data?: ScrapedProduct;
  error?: string;
  timestamp: string;
}

export interface ScraperOptions {
  timeout?: number;
  headless?: boolean;
  userAgent?: string;
}