import { BaseScraper } from './BaseScraper';
import { ScrapedProduct, ScrapingResult } from '@/types/scraper';

export class KakobuyScraper extends BaseScraper {
  /**
   * Clean image URL by removing resize parameters and format conversions
   * Example: https://example.com/image.jpg_400x400q85.jpg_.webp -> https://example.com/image.jpg
   */
  private cleanImageUrl(url: string): string {
    let cleanUrl = url;
    
    // Handle protocol-relative URLs
    if (cleanUrl.startsWith('//')) {
      cleanUrl = `https:${cleanUrl}`;
    }
    // Handle relative URLs
    if (cleanUrl.startsWith('/')) {
      cleanUrl = `https://kakobuy.com${cleanUrl}`;
    }
    
    // Clean image URL parameters (remove resize parameters)
    // Remove patterns like: _400x400q85.jpg_.webp, _400x400q85.jpg, _400x400.jpg
    cleanUrl = cleanUrl.replace(/_\d+x\d+q\d+\.jpg_\.webp$/, '');
    cleanUrl = cleanUrl.replace(/_\d+x\d+q\d+\.jpg$/, '');
    cleanUrl = cleanUrl.replace(/_\d+x\d+\.jpg$/, '');
    cleanUrl = cleanUrl.replace(/\.webp$/, '');
    
    return cleanUrl;
  }

  async scrape(url: string): Promise<ScrapingResult> {
    const page = await this.createPage();
    
    try {
      console.log(`Scraping Kakobuy URL: ${url}`);
      
      // Navigate to the page
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: this.options.timeout 
      });

      // Wait for page to load and handle potential redirects
      await this.delay(5000);
      
      // Check if we're on a linkutils page and wait for it to load the actual product
      let currentUrl = page.url();
      if (currentUrl.includes('kakobuy.com/item/details')) {
        console.log('Detected Kakobuy linkutils page, waiting for product to load...');
        await this.delay(5000);
        
        // Try to wait for the product content to load
        try {
          await page.waitForSelector('img', { timeout: 10000 });
        } catch (error) {
          console.log('No images found, continuing...');
        }
        
        // Update current URL after potential redirects
        currentUrl = page.url();
      }

      // Check if we need to handle login or verification
      if (currentUrl.includes('login') || currentUrl.includes('verify')) {
        throw new Error('Kakobuy requires login or verification');
      }

      // Extract product information
      const product: ScrapedProduct = {
        url,
        title: '',
        price: '',
        currency: 'CNY',
        platform: 'kakobuy'
      };

      // Try multiple selectors for title
      const titleSelectors = [
        '.product-title',
        '.item-title',
        '.goods-title',
        'h1.product-title',
        'h1.item-title',
        '.product-info .title',
        '.product-details .title',
        '.product-name',
        'h1',
        '.title'
      ];

      for (const selector of titleSelectors) {
        const title = await this.extractText(page, selector);
        if (title) {
          product.title = title;
          break;
        }
      }

      // Try multiple selectors for price (focus on CNY)
      const priceSelectors = [
        '.product-price',
        '.price',
        '.current-price',
        '.product-info .price',
        '.product-details .price',
        '.price-current',
        '.price .current',
        '.cost',
        '.amount',
        '[class*="price"]',
        '[class*="cost"]',
        '[class*="amount"]',
        // More generic selectors
        'span:contains("¥")',
        'div:contains("¥")',
        'p:contains("¥")',
        'span:contains("CNY")',
        'div:contains("CNY")',
        'p:contains("CNY")',
        // Try to find any element containing price patterns
        '*:contains("￥")',
        '*:contains("¥")',
        '*:contains("CNY")'
      ];

      for (const selector of priceSelectors) {
        const price = await this.extractText(page, selector);
        if (price) {
          console.log(`🔍 Probando selector de precio "${selector}": "${price}"`);
          // Look for CNY prices specifically and avoid USD conversion
          if (price.includes('¥') || price.includes('CNY') || price.includes('元')) {
            // Extract only the CNY part, ignore USD conversion
            let cnyPrice = price;
            
            // If there's a USD conversion, extract only the CNY part
            if (price.includes('≈') || price.includes('$')) {
              // Split by ≈ or $ and take the first part (CNY)
              const parts = price.split(/≈|\$/);
              if (parts.length > 0) {
                cnyPrice = parts[0].trim();
              }
            }
            
            // Clean price text - keep numbers, dots, commas, and CNY symbols
            const cleanPrice = cnyPrice.replace(/[^\d.,¥元]/g, '').trim();
            if (cleanPrice && cleanPrice.length > 0) {
              product.price = cleanPrice;
              product.currency = 'CNY';
              console.log(`✅ Precio CNY extraído: ${cleanPrice} (original: ${price})`);
              break;
            }
          }
        }
      }

      // If no CNY price found, try to extract any price and convert
      if (!product.price) {
        for (const selector of priceSelectors) {
          const price = await this.extractText(page, selector);
          if (price) {
            // Try to extract CNY part even if not explicitly marked
            let cnyPrice = price;
            
            // If there's a USD conversion, extract only the CNY part
            if (price.includes('≈') || price.includes('$')) {
              const parts = price.split(/≈|\$/);
              if (parts.length > 0) {
                cnyPrice = parts[0].trim();
              }
            }
            
            // Clean price text - keep numbers, dots, commas, and CNY symbols
            const cleanPrice = cnyPrice.replace(/[^\d.,¥元]/g, '').trim();
            if (cleanPrice && cleanPrice.length > 0) {
              product.price = cleanPrice;
              product.currency = 'CNY'; // Assume CNY for Kakobuy
              console.log(`✅ Precio extraído (fallback): ${cleanPrice} (original: ${price})`);
              break;
            }
          }
        }
      }

      // If still no price found, try a more aggressive approach
      if (!product.price) {
        console.log('🔍 No se encontró precio con selectores específicos, intentando enfoque agresivo...');
        
        try {
          // Use JavaScript to find any element containing price patterns
          const priceElements = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('*'));
            const pricePatterns = [
              /CNY\s*[¥￥]\s*\d+/i,
              /[¥￥]\s*\d+/,
              /CNY\s*\d+/i,
              /\d+\s*[¥￥]/,
              /price[^>]*>\s*[¥￥]\s*\d+/i,
              /cost[^>]*>\s*[¥￥]\s*\d+/i
            ];
            
            const foundElements: Array<{
              text: string;
              tagName: string;
              className: string;
              id: string;
            }> = [];
            
            elements.forEach(el => {
              const text = el.textContent || '';
              pricePatterns.forEach(pattern => {
                if (pattern.test(text) && text.length < 100) { // Avoid very long texts
                  foundElements.push({
                    text: text.trim(),
                    tagName: el.tagName,
                    className: el.className,
                    id: el.id
                  });
                }
              });
            });
            
            return foundElements;
          });
          
          console.log(`🔍 Encontrados ${priceElements.length} elementos con patrones de precio`);
          
          for (const element of priceElements) {
            console.log(`🔍 Elemento de precio: "${element.text}" (${element.tagName}.${element.className})`);
            
            if (element.text.includes('¥') || element.text.includes('￥') || element.text.includes('CNY')) {
              let cnyPrice = element.text;
              
              // If there's a USD conversion, extract only the CNY part
              if (element.text.includes('≈') || element.text.includes('$')) {
                const parts = element.text.split(/≈|\$/);
                if (parts.length > 0) {
                  cnyPrice = parts[0].trim();
                }
              }
              
              // Clean price text
              const cleanPrice = cnyPrice.replace(/[^\d.,¥￥元]/g, '').trim();
              if (cleanPrice && cleanPrice.length > 0) {
                product.price = cleanPrice;
                product.currency = 'CNY';
                console.log(`✅ Precio extraído (enfoque agresivo): ${cleanPrice} (original: ${element.text})`);
                break;
              }
            }
          }
        } catch (error) {
          console.log('⚠️ Error en enfoque agresivo de precios:', error instanceof Error ? error.message : 'Unknown error');
        }
      }

      // Extract main product image with more comprehensive selectors
      const imageSelectors = [
        '.product-image img',
        '.main-image img',
        '.product-pic img',
        '.item-image img',
        '.goods-image img',
        '.product-gallery img',
        '.image-gallery img',
        '.product-photo img',
        '.main-pic img',
        '.primary-image img',
        '.product-detail img',
        '.product-info img',
        '.item-detail img',
        '.goods-detail img',
        '[class*="product"] img',
        '[class*="item"] img',
        '[class*="goods"] img',
        'img[src*="product"]',
        'img[src*="item"]',
        'img[src*="goods"]',
        'img[alt*="product"]',
        'img[alt*="item"]',
        'img[alt*="goods"]'
      ];

      console.log('🔍 Buscando imágenes del producto...');
      
      for (const selector of imageSelectors) {
        try {
          const images = await this.extractMultipleAttributes(page, selector, 'src');
          if (images.length > 0) {
            console.log(`📸 Encontradas ${images.length} imágenes con selector "${selector}"`);
            
            // Filter and clean image URLs
            const cleanImages = images
              .map(img => this.cleanImageUrl(img))
              .filter(img => {
                // Filter out invalid or placeholder images
                return img && 
                       img.length > 10 && 
                       !img.includes('data:image') &&
                       !img.includes('placeholder') &&
                       !img.includes('loading') &&
                       !img.includes('avatar') &&
                       !img.includes('icon') &&
                       !img.includes('logo') &&
                       !img.includes('banner') &&
                       !img.includes('sprite') &&
                       !img.includes('bg-') &&
                       (img.includes('http') || img.includes('kakobuy') || img.includes('image') || img.includes('photo') || img.includes('jpg') || img.includes('png') || img.includes('webp'));
              });
            
            if (cleanImages.length > 0) {
              console.log(`✅ Imagen principal encontrada: ${cleanImages[0]}`);
              // Take only the first (main) image
              product.images = [cleanImages[0]];
              break;
            }
          }
        } catch (error) {
          console.log(`⚠️ Error con selector "${selector}":`, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      // If no images found with specific selectors, try a broader approach
      if (!product.images || product.images.length === 0) {
        console.log('🔍 No se encontraron imágenes con selectores específicos, intentando enfoque más amplio...');
        
        try {
          // Get all images on the page
          const allImages = await page.$$eval('img', imgs => 
            imgs.map(img => ({
              src: img.src,
              alt: img.alt || '',
              width: img.width,
              height: img.height
            }))
          );
          
          console.log(`📸 Total de imágenes en la página: ${allImages.length}`);
          
          // Filter for product images
          const productImages = allImages
            .filter(img => {
              return img.src && 
                     img.src.length > 10 && 
                     !img.src.includes('data:image') &&
                     !img.src.includes('placeholder') &&
                     !img.src.includes('loading') &&
                     !img.src.includes('avatar') &&
                     !img.src.includes('icon') &&
                     !img.src.includes('logo') &&
                     !img.src.includes('banner') &&
                     !img.src.includes('sprite') &&
                     !img.src.includes('bg-') &&
                     (img.src.includes('http') || img.src.includes('kakobuy') || img.src.includes('image') || img.src.includes('photo') || img.src.includes('jpg') || img.src.includes('png') || img.src.includes('webp')) &&
                     img.width > 100 && // Filter out small icons
                     img.height > 100;
            })
            .map(img => this.cleanImageUrl(img.src));
          
          if (productImages.length > 0) {
            console.log(`✅ Imagen principal encontrada (enfoque amplio): ${productImages[0]}`);
            product.images = [productImages[0]];
          } else {
            console.log('🔍 No se encontraron imágenes con enfoque amplio, intentando enfoque agresivo...');
            
            // Try to find any image that looks like a product image
            const allImages = await page.$$eval('img', imgs => 
              imgs.map(img => ({
                src: img.src,
                alt: img.alt || '',
                width: img.width,
                height: img.height,
                className: img.className,
                id: img.id
              }))
            );
            
            console.log(`📸 Total de imágenes encontradas: ${allImages.length}`);
            
            // Log all images for debugging
            allImages.forEach((img, index) => {
              console.log(`📸 Imagen ${index + 1}: ${img.src} (${img.width}x${img.height}) - ${img.className}`);
            });
            
            // Try to find the largest image that's not an icon/logo
            const validImages = allImages
              .filter(img => {
                return img.src && 
                       img.src.length > 10 && 
                       !img.src.includes('data:image') &&
                       !img.src.includes('placeholder') &&
                       !img.src.includes('loading') &&
                       !img.src.includes('avatar') &&
                       !img.src.includes('icon') &&
                       !img.src.includes('logo') &&
                       !img.src.includes('banner') &&
                       !img.src.includes('sprite') &&
                       !img.src.includes('bg-') &&
                       img.width > 50 && // Lower threshold
                       img.height > 50;
              })
              .sort((a, b) => (b.width * b.height) - (a.width * a.height)); // Sort by area
            
            if (validImages.length > 0) {
              const mainImage = validImages[0];
              const cleanSrc = this.cleanImageUrl(mainImage.src);
              
              console.log(`✅ Imagen principal encontrada (enfoque agresivo): ${cleanSrc} (${mainImage.width}x${mainImage.height})`);
              product.images = [cleanSrc];
            }
          }
        } catch (error) {
          console.log('⚠️ Error en enfoque amplio de imágenes:', error instanceof Error ? error.message : 'Unknown error');
        }
      }

      // Extract seller information
      const sellerSelectors = [
        '.seller-name',
        '.shop-name',
        '.store-name',
        '.vendor-name',
        '.product-seller',
        '.seller-info .name',
        '.shop-info .name'
      ];

      for (const selector of sellerSelectors) {
        const seller = await this.extractText(page, selector);
        if (seller) {
          product.seller = seller;
          break;
        }
      }

      // Extract rating
      const ratingSelectors = [
        '.rating-score',
        '.product-rating',
        '.rating .score',
        '.stars .rating',
        '.review-rating'
      ];

      for (const selector of ratingSelectors) {
        const rating = await this.extractText(page, selector);
        if (rating) {
          product.rating = parseFloat(rating);
          break;
        }
      }

      // Extract review count
      const reviewSelectors = [
        '.review-count',
        '.rating-count',
        '.reviews-count',
        '.review .count',
        '.rating .count'
      ];

      for (const selector of reviewSelectors) {
        const reviews = await this.extractText(page, selector);
        if (reviews) {
          const reviewNumber = reviews.match(/\d+/);
          if (reviewNumber) {
            product.reviews = parseInt(reviewNumber[0]);
          }
          break;
        }
      }

      // Extract stock information
      const stockSelectors = [
        '.stock-info',
        '.inventory',
        '.stock',
        '.availability',
        '.product-stock'
      ];

      for (const selector of stockSelectors) {
        const stock = await this.extractText(page, selector);
        if (stock) {
          product.stock = stock;
          break;
        }
      }

      // Extract description
      const descriptionSelectors = [
        '.product-description',
        '.product-desc',
        '.description',
        '.product-details .desc',
        '.item-description'
      ];

      for (const selector of descriptionSelectors) {
        const description = await this.extractText(page, selector);
        if (description) {
          product.description = description;
          break;
        }
      }

      // Validate that we got at least title or price
      if (!product.title && !product.price) {
        throw new Error('Could not extract required product information');
      }
      
      // If we don't have a title, try to get it from the page title
      if (!product.title) {
        const pageTitle = await page.title();
        if (pageTitle && pageTitle.trim()) {
          product.title = pageTitle.trim();
        }
      }

      return {
        success: true,
        data: product,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Kakobuy scraping error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date().toISOString()
      };
    } finally {
      await page.close();
    }
  }
}
