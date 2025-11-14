import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

interface ProductData {
  nombre: string;
  precio: number;
  img: string;
  categoria: string;
  links: {
    KakoBuy: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const productData: ProductData = await request.json();

    // Validate required fields
    if (!productData.nombre || !productData.precio || !productData.img || 
        !productData.categoria || !productData.links.KakoBuy) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Insert product into Supabase
    const { data, error } = await supabase
      .from('products')
      .insert([
        {
          nombre: productData.nombre,
          precio: productData.precio,
          img: productData.img,
          categoria: productData.categoria,
          links: productData.links,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save product to database' },
        { status: 500 }
      );
    }

    console.log('Product saved to database:', data);

    // Send Telegram notification
    try {
      const { sendTelegramNotification } = await import('../../../../lib/telegram-notifications');
      await sendTelegramNotification(productData);
    } catch (telegramError) {
      console.warn('Telegram notification failed:', telegramError);
      // Don't fail the product addition if Telegram fails
    }

    return NextResponse.json({
      success: true,
      message: 'Product added successfully',
      productId: data.id
    });

  } catch (error) {
    console.error('Error adding product:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
