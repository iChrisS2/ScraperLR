import { ScrapedProduct, ScrapingResult } from '@/types/scraper';
import type { PlaywrightCrawler } from 'crawlee';

export class KakobuyCrawleeScraper {
  private crawler: PlaywrightCrawler | null = null;
  private results: Map<string, ScrapedProduct> = new Map();
  private errors: Map<string, string> = new Map();
  private options: { headless?: boolean };

  constructor(options: { headless?: boolean } = {}) {
    this.options = options;
  }


  async scrape(url: string | string[]): Promise<ScrapingResult | ScrapingResult[]> {
    this.results.clear();
    this.errors.clear();

    const urls = Array.isArray(url) ? url : [url];
    
    try {
      // Siempre crear un nuevo crawler para cada scrape con el número correcto de requests
      this.crawler = null;
      
      // Importación dinámica para evitar problemas con webpack
      const { PlaywrightCrawler, RequestQueue } = await import('crawlee');
      
      // Limpiar RequestQueue antes de ejecutar para evitar problemas
      const requestQueue = await RequestQueue.open();
      await requestQueue.drop();
      
      const crawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: urls.length,
        headless: this.options.headless !== false,
        requestHandler: async ({ request, page, log }) => {
          log.info(`Scraping: ${request.url}`);

          try {
            await page.waitForLoadState('networkidle', { timeout: 30000 });
            
            // Esperar un poco más para que cargue el contenido dinámico
            await page.waitForTimeout(3000);

            // Detectar si es un link de Weidian (puede cargar en iframe)
            const isWeidianLink = request.url.includes('weidian.com');
            if (isWeidianLink) {
              await page.waitForTimeout(5000);
            }

            // ---------- NOMBRE ----------
            let name = null;
            try {
              await page.waitForSelector('span.item-title', { timeout: 15000 });
              name = (await page.locator('span.item-title').innerText()).trim();
            } catch (error) {
              log.warning('No se pudo encontrar el nombre con span.item-title, intentando otros selectores...');
              // Intentar otros selectores
              const titleSelectors = [
                '.product-title',
                '.item-title',
                '.goods-title',
                'h1.product-title',
                'h1.item-title',
                '.product-info .title',
                'h1'
              ];
              
              for (const selector of titleSelectors) {
                try {
                  const element = page.locator(selector).first();
                  if (await element.count() > 0) {
                    name = (await element.innerText()).trim();
                    if (name && name.length > 0) break;
                  }
                } catch (e) {
                  continue;
                }
              }
            }

            // Para Weidian, también buscar en iframes
            if (!name && isWeidianLink) {
              try {
                const frames = page.frames();
                for (const frame of frames) {
                  if (frame.url().includes('weidian.com') || frame.url().includes('item')) {
                    const titleSelectors = ['.product-title', '.item-title', '.goods-title', 'h1'];
                    for (const selector of titleSelectors) {
                      try {
                        const titleEl = await frame.$(selector);
                        if (titleEl) {
                          const titleText = await frame.evaluate(el => el.textContent?.trim() || '', titleEl);
                          if (titleText && titleText.length > 0) {
                            name = titleText;
                            break;
                          }
                        }
                      } catch (e) {
                        continue;
                      }
                    }
                    if (name) break;
                  }
                }
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                log.warning('Error buscando título en iframes:', { error: errorMsg });
              }
            }

            // ---------- IMAGEN PRINCIPAL ----------
            let imageUrl = null;
            try {
              const imgLocator = page.locator('div.el-image.preview-img img').first();
              if (await imgLocator.count() > 0) {
                const imgSrc = await imgLocator.getAttribute('src');
                
                if (imgSrc) {
                  let absolute = new URL(imgSrc, request.loadedUrl ?? request.url).href;

                  try {
                    const u = new URL(absolute);

                    if (u.hostname.includes('alicdn.com')) {
                      // Ejemplo: /.../O1CN0....jpg_400x400q85.jpg_.webp
                      // Nos quedamos solo hasta el **primer** .jpg/.jpeg/.png/.webp
                      const matchPath = u.pathname.match(/(.*?\.(?:jpg|jpeg|png|webp))/i);
                      if (matchPath) {
                        u.pathname = matchPath[1];
                        absolute = u.toString();
                      }
                    }

                    imageUrl = absolute;
                  } catch {
                    imageUrl = absolute;
                  }
                }
              }
            } catch (error) {
              log.warning('No se pudo extraer la imagen principal');
            }

            // Si no se encontró imagen, intentar otros selectores
            if (!imageUrl) {
              const imageSelectors = [
                '.product-image img',
                '.main-image img',
                '.product-pic img',
                '.item-image img',
                'img[src*="product"]',
                'img[src*="item"]'
              ];
              
              for (const selector of imageSelectors) {
                try {
                  const imgEl = page.locator(selector).first();
                  if (await imgEl.count() > 0) {
                    const imgSrc = await imgEl.getAttribute('src');
                    if (imgSrc && !imgSrc.includes('data:image') && !imgSrc.includes('placeholder')) {
                      imageUrl = new URL(imgSrc, request.loadedUrl ?? request.url).href;
                      break;
                    }
                  }
                } catch (e) {
                  continue;
                }
              }
            }

            // Para Weidian, buscar imágenes en iframes
            if (!imageUrl && isWeidianLink) {
              try {
                const frames = page.frames();
                for (const frame of frames) {
                  if (frame.url().includes('weidian.com') || frame.url().includes('item')) {
                    try {
                      const iframeImages = await frame.$$eval('img', imgs => 
                        imgs.map(img => ({
                          src: img.src,
                          width: img.width,
                          height: img.height
                        }))
                      );
                      
                      const productImages = iframeImages
                        .filter(img => {
                          return img.src && 
                                 img.src.length > 10 && 
                                 !img.src.includes('data:image') &&
                                 !img.src.includes('placeholder') &&
                                 !img.src.includes('loading') &&
                                 !img.src.includes('avatar') &&
                                 !img.src.includes('icon') &&
                                 !img.src.includes('logo') &&
                                 img.width > 100 &&
                                 img.height > 100;
                        })
                        .map(img => {
                          // Limpiar URL de imagen
                          let cleanUrl = img.src;
                          if (cleanUrl.includes('alicdn.com')) {
                            const matchPath = cleanUrl.match(/(.*?\.(?:jpg|jpeg|png|webp))/i);
                            if (matchPath) {
                              cleanUrl = matchPath[1];
                            }
                          }
                          return cleanUrl;
                        });
                      
                      if (productImages.length > 0) {
                        imageUrl = productImages[0];
                        break;
                      }
                    } catch (error) {
                      continue;
                    }
                  }
                }
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                log.warning('Error buscando imágenes en iframes:', { error: errorMsg });
              }
            }

            // ---------- PRECIO EN CNY ----------
            let rawPrice = null;
            let priceCny = null;
            
            try {
              await page.waitForSelector('span.sku-price', { timeout: 10000 });
              rawPrice = (await page.locator('span.sku-price').first().innerText()).trim();
            } catch (error) {
              log.warning('No se pudo encontrar el precio con span.sku-price, intentando otros selectores...');
              // Intentar otros selectores de precio
              const priceSelectors = [
                '.product-price',
                '.price',
                '.current-price',
                '.sku-price',
                '[class*="price"]'
              ];
              
              for (const selector of priceSelectors) {
                try {
                  const priceEl = page.locator(selector).first();
                  if (await priceEl.count() > 0) {
                    rawPrice = (await priceEl.innerText()).trim();
                    if (rawPrice && (rawPrice.includes('¥') || rawPrice.includes('￥') || rawPrice.includes('CNY'))) {
                      break;
                    }
                  }
                } catch (e) {
                  continue;
                }
              }
            }

            // Para Weidian, buscar precio en iframes
            if (!rawPrice && isWeidianLink) {
              try {
                const frames = page.frames();
                for (const frame of frames) {
                  if (frame.url().includes('weidian.com') || frame.url().includes('item')) {
                    const priceSelectors = ['.product-price', '.price', '.current-price', '.sku-price', '[class*="price"]'];
                    for (const selector of priceSelectors) {
                      try {
                        const priceEl = await frame.$(selector);
                        if (priceEl) {
                          const priceText = await frame.evaluate(el => el.textContent?.trim() || '', priceEl);
                          if (priceText && (priceText.includes('¥') || priceText.includes('￥') || priceText.includes('CNY'))) {
                            rawPrice = priceText;
                            break;
                          }
                        }
                      } catch (e) {
                        continue;
                      }
                    }
                    if (rawPrice) break;
                  }
                }
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                log.warning('Error buscando precio en iframes:', { error: errorMsg });
              }
            }
            
            if (rawPrice) {
              // Ejemplo: "CNY ￥232.75 ≈ $ 35.55"
              const match = rawPrice.match(/[¥￥]\s*([\d.,]+)/);
              priceCny = match ? parseFloat(match[1].replace(',', '')) : null;
            }

            // Limpiar precio - extraer solo números y punto decimal
            let cleanPrice = '';
            if (rawPrice) {
              // Extraer solo la parte CNY, ignorar conversión USD
              let cnyPrice = rawPrice;
              if (rawPrice.includes('≈') || rawPrice.includes('$')) {
                const parts = rawPrice.split(/≈|\$/);
                if (parts.length > 0) {
                  cnyPrice = parts[0].trim();
                }
              }
              // Limpiar y mantener solo números, punto y coma
              cleanPrice = cnyPrice.replace(/[^\d.,¥￥元]/g, '').trim();
            }

            const product: ScrapedProduct = {
              url: request.loadedUrl ?? request.url,
              title: name || '',
              price: cleanPrice || '',
              currency: 'CNY',
              platform: 'kakobuy',
              images: imageUrl ? [imageUrl] : []
            };

            this.results.set(request.url, product);
            log.info(`Resultado: ${JSON.stringify(product, null, 2)}`);

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            log.error(`Error procesando ${request.url}:`, { error: errorMessage });
            this.errors.set(request.url, errorMessage);
            // No lanzar el error, solo registrarlo para que el crawler continúe
          }
        },
      });
      
      // Asegurar que las URLs se pasen correctamente al crawler
      console.log(`Encolando ${urls.length} URL(s) para scraping...`);
      // Agregar las URLs al RequestQueue antes de ejecutar
      await crawler.addRequests(urls);
      await crawler.run();
      
      // Normalizar URLs para el mapeo (usar loadedUrl si está disponible)
      const normalizeUrl = (url: string): string => {
        try {
          const urlObj = new URL(url);
          return urlObj.href;
        } catch {
          return url;
        }
      };
      
      // Si es un array, retornar array de resultados mapeados por URL
      if (Array.isArray(url)) {
        return urls.map((urlItem) => {
          // Intentar encontrar el resultado por URL normalizada o por cualquier variación
          let result = this.results.get(urlItem);
          let error = this.errors.get(urlItem);
          
          // Si no se encuentra, buscar en todas las claves del Map
          if (!result && !error) {
            for (const [key, value] of Array.from(this.results.entries())) {
              if (normalizeUrl(key) === normalizeUrl(urlItem) || key.includes(urlItem) || urlItem.includes(key)) {
                result = value;
                break;
              }
            }
          }
          
          if (!result && !error) {
            for (const [key, value] of Array.from(this.errors.entries())) {
              if (normalizeUrl(key) === normalizeUrl(urlItem) || key.includes(urlItem) || urlItem.includes(key)) {
                error = value;
                break;
              }
            }
          }
          
          if (result) {
            return {
              success: true,
              data: result,
              timestamp: new Date().toISOString()
            };
          } else {
            return {
              success: false,
              error: error || 'No se pudo extraer información del producto',
              timestamp: new Date().toISOString()
            };
          }
        });
      }
      
      // Si es un solo URL, retornar un solo resultado
      const singleUrl = urls[0];
      let result = this.results.get(singleUrl);
      let error = this.errors.get(singleUrl);
      
      // Si no se encuentra, buscar en todas las claves del Map
      if (!result && !error) {
        for (const [key, value] of Array.from(this.results.entries())) {
          if (normalizeUrl(key) === normalizeUrl(singleUrl) || key.includes(singleUrl) || singleUrl.includes(key)) {
            result = value;
            break;
          }
        }
      }
      
      if (!result && !error) {
        for (const [key, value] of Array.from(this.errors.entries())) {
          if (normalizeUrl(key) === normalizeUrl(singleUrl) || key.includes(singleUrl) || singleUrl.includes(key)) {
            error = value;
            break;
          }
        }
      }
      
      if (result) {
        return {
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        };
      } else {
        return {
          success: false,
          error: error || 'No se pudo extraer información del producto',
          timestamp: new Date().toISOString()
        };
      }
    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      };
      
      if (Array.isArray(url)) {
        return urls.map(() => errorResult);
      }
      
      return errorResult;
    }
  }

  async close(): Promise<void> {
    // Crawlee maneja el cierre automáticamente
  }
}

