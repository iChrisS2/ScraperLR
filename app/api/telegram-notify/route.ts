import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramNotification } from '../../../lib/telegram-notifications';

export async function POST(request: NextRequest) {
  try {
    const { productName, cnyPrice, usdPrice, kakobuyLink, originalLink } = await request.json();

    if (!productName || !cnyPrice || !usdPrice || !kakobuyLink || !originalLink) {
      return NextResponse.json(
        { success: false, error: 'Missing required product information for Telegram notification' },
        { status: 400 }
      );
    }

    const productData = {
      nombre: productName,
      precio: cnyPrice,
      img: '', // You might want to pass this as well
      categoria: '',
      links: {
        KakoBuy: kakobuyLink
      }
    };

    const success = await sendTelegramNotification(productData, originalLink);

    if (success) {
      return NextResponse.json({ success: true, message: 'Telegram notification sent' });
    } else {
      return NextResponse.json({ success: false, error: 'Failed to send Telegram notification' }, { status: 500 });
    }
  } catch (error) {
    console.error('API Telegram Notify Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
