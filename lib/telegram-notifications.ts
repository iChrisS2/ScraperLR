interface ProductData {
  nombre: string;
  precio: number;
  img: string;
  categoria: string;
  links: {
    KakoBuy: string;
  };
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send product notification to Telegram channel
 */
export async function sendTelegramNotification(product: ProductData, originalUrl?: string): Promise<boolean> {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Telegram credentials not configured');
      return false;
    }

    // Calculate USD price (assuming 1 CNY = 0.15 USD)
    const usdPrice = (product.precio * 0.15).toFixed(2);
    
    // Detectar el tipo de link original para mostrar la etiqueta correcta
    const getLinkLabel = (url: string): string => {
      if (!url) return '';
      if (url.includes('1688.com')) return '1688 Link';
      if (url.includes('taobao.com') || url.includes('tmall.com')) return 'Taobao Link';
      if (url.includes('weidian.com')) return 'Weidian Link';
      if (url.includes('kakobuy.com')) return 'Kakobuy Link';
      return 'Original Link';
    };
    
    const linkLabel = originalUrl ? getLinkLabel(originalUrl) : '';
    
    // Format the message with new structure
    const message = `🔥 ${product.nombre}
💰 CNY ￥${product.precio.toFixed(2)} ≈ $${usdPrice}
🛒 [Kakobuy Link](${product.links.KakoBuy})

🎁 [LATAM15 = $410 + $15](https://www.kakobuy.com/register/?affcode=latam)`;

    // First try to send with photo
    if (product.img && product.img.trim()) {
      console.log('📸 Attempting to send with image:', product.img);
      
      const photoResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          photo: product.img,
          caption: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      });

      if (photoResponse.ok) {
        console.log('✅ Telegram notification with image sent successfully');
        return true;
      } else {
        const errorData = await photoResponse.json();
        console.warn('⚠️ Failed to send with image, trying without image:', errorData);
      }
    }

    // Fallback: send message without photo
    console.log('📝 Sending message without image as fallback');
    const messageResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    if (messageResponse.ok) {
      console.log('✅ Telegram notification sent successfully (without image)');
      return true;
    } else {
      const errorData = await messageResponse.json();
      console.error('❌ Telegram API error:', errorData);
      return false;
    }

  } catch (error) {
    console.error('❌ Error sending Telegram notification:', error);
    return false;
  }
}

/**
 * Send multiple products notification to Telegram channel
 */
export async function sendBulkTelegramNotification(products: ProductData[], originalUrls?: string[]): Promise<boolean> {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.error('Telegram credentials not configured');
      return false;
    }

    if (products.length === 0) {
      return false;
    }

    // For bulk notifications, we'll send individual messages with images
    // This provides better visual experience than a single long message
    const results = await Promise.all(
      products.map(async (product, index) => {
        const usdPrice = (product.precio * 0.15).toFixed(2);
        const originalUrl = originalUrls?.[index] || '';
        
        // Detectar el tipo de link original para mostrar la etiqueta correcta
        const getLinkLabel = (url: string): string => {
          if (!url) return '';
          if (url.includes('1688.com')) return '1688 Link';
          if (url.includes('taobao.com') || url.includes('tmall.com')) return 'Taobao Link';
          if (url.includes('weidian.com')) return 'Weidian Link';
          if (url.includes('kakobuy.com')) return 'Kakobuy Link';
          return 'Original Link';
        };
        
        const linkLabel = originalUrl ? getLinkLabel(originalUrl) : '';
        
        // Format the message with new structure
        const message = `🔥 ${product.nombre}
💰 CNY ￥${product.precio.toFixed(2)} ≈ $${usdPrice}
🛒 [Kakobuy Link](${product.links.KakoBuy})

${originalUrl ? `🔗 [${linkLabel}](${originalUrl})` : ''}

🎁 [LATAM15 = $410 + $15](https://www.kakobuy.com/register/?affcode=latam)`;

        // Try with image first, fallback to message without image
        if (product.img && product.img.trim()) {
          const photoResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: TELEGRAM_CHAT_ID,
              photo: product.img,
              caption: message,
              parse_mode: 'Markdown',
              disable_web_page_preview: false,
            }),
          });

          if (photoResponse.ok) {
            return photoResponse;
          }
        }

        // Fallback to message without image
        return fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: false,
          }),
        });
      })
    );

    const successCount = results.filter(response => response.ok).length;
    
    if (successCount === products.length) {
      console.log(`✅ All ${products.length} bulk Telegram notifications sent successfully`);
      return true;
    } else {
      console.log(`⚠️ ${successCount}/${products.length} bulk Telegram notifications sent`);
      return successCount > 0; // Return true if at least some were sent
    }

  } catch (error) {
    console.error('❌ Error sending bulk Telegram notification:', error);
    return false;
  }
}