"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, ExternalLink, Image as ImageIcon, DollarSign, Package, Tag, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { processAnyLinkAsync, isValidProductUrl } from '@/lib/link-processor';
import { ScrapedProduct, ScrapingResult } from '@/types/scraper';
import { QCImageModal } from '@/components/admin/qc-image-modal';

interface ProductToAdd {
  id: string;
  originalUrl: string;
  kakobuyUrl: string;
  scrapedData?: ScrapedProduct;
  nombre: string;
  precio: number;
  img: string;
  categoria: string;
  status: 'pending' | 'scraping' | 'scraped' | 'error';
  qcImages?: string[];
}

const CATEGORIAS = [
  "Hoodies", "Jackets", "Shorts", "Shoes", "Accessories", "T-shirt", "Pants", "Girls", "Tracksuits"
];

export default function ScrapingPage() {
  const [urls, setUrls] = useState('');
  const [products, setProducts] = useState<ProductToAdd[]>([]);
  const [loading, setLoading] = useState(false);
  const [qcModalOpen, setQcModalOpen] = useState(false);
  const [selectedProductForQC, setSelectedProductForQC] = useState<ProductToAdd | null>(null);
  const { toast } = useToast();

  // Convert URLs to Kakobuy using link-processor with affiliate code
  const convertToKakobuy = async (url: string): Promise<string> => {
    try {
      if (!isValidProductUrl(url)) {
        return url; // Return original if not valid
      }

      const result = await processAnyLinkAsync(url, 'KakoBuy', 'latam');
      
      // Ensure the link has the affiliate code
      if (result.agentLink && result.agentLink.includes('affcode=latam')) {
        return result.agentLink;
      }
      
      // If agentLink is empty or doesn't have affcode, try to ensure it's added
      if (result.agentLink && result.agentLink.includes('kakobuy.com/item/details')) {
        // If it's already a kakobuy link but missing affcode, add it
        if (!result.agentLink.includes('affcode=')) {
          // Links of kakobuy.com/item/details always have a ?url= parameter, so use &
          return result.agentLink + '&affcode=latam';
        }
      }
      
      // Fallback: if we have an agentLink, use it even without affcode check
      if (result.agentLink) {
        return result.agentLink;
      }
      
      return url; // Last resort: return original
    } catch (error) {
      console.error('Error converting URL:', error);
      return url; // Fallback to original URL
    }
  };

  // Scrape product data from Kakobuy (solo una URL a la vez)
  const scrapeProduct = async (kakobuyUrl: string): Promise<ScrapingResult> => {
    try {
      const response = await fetch('/api/scraper/kakobuy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: kakobuyUrl }),
      });

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: 'Network error occurred',
        timestamp: new Date().toISOString(),
      };
    }
  };

  // Fetch QC images for a product
  const fetchQCImages = async (originalUrl: string): Promise<string[]> => {
    try {
      console.log('Fetching QC images for:', originalUrl);
      const response = await fetch('/api/qc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ goodsUrl: originalUrl }),
      });

      if (!response.ok) {
        console.warn('Failed to fetch QC images for:', originalUrl, 'Status:', response.status);
        return [];
      }

      const data = await response.json();
      console.log('QC API response:', data);
      
      if (response.ok && data.status === 'success') {
        // Extract all images from galleries
        const images = data.galleries?.flatMap((gallery: any) => 
          gallery.images?.map((img: any) => img.image_url) || []
        ) || [];
        return images;
      } else {
        console.warn('QC API error:', data.message);
        return [];
      }
    } catch (error) {
      console.warn('Error fetching QC images:', error);
      return [];
    }
  };

  const processUrls = async () => {
    if (!urls.trim()) return;

    const urlList = urls
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);

    if (urlList.length === 0) return;

    setLoading(true);
    const newProducts: ProductToAdd[] = [];

    // Procesar URLs una por una secuencialmente
    for (let i = 0; i < urlList.length; i++) {
      const originalUrl = urlList[i];
      const productId = `product-${Date.now()}-${i}`;
      
      // Create initial product entry
      const product: ProductToAdd = {
        id: productId,
        originalUrl,
        kakobuyUrl: '',
        nombre: '',
        precio: 0,
        img: '',
        categoria: '',
        status: 'pending'
      };

      newProducts.push(product);
      setProducts(prev => [...prev, product]);

      try {
        // Step 1: Convert to Kakobuy URL
        product.status = 'scraping';
        setProducts(prev => prev.map(p => p.id === productId ? { ...p, status: 'scraping' } : p));

        const kakobuyUrl = await convertToKakobuy(originalUrl);
        product.kakobuyUrl = kakobuyUrl;

        // Step 2: Scrape product data (una por una)
        const scrapingResult = await scrapeProduct(kakobuyUrl);

        if (scrapingResult.success && scrapingResult.data) {
          const scrapedData = scrapingResult.data;
          product.scrapedData = scrapedData;
          product.nombre = scrapedData.title || '';
          product.precio = parseFloat(scrapedData.price?.replace(/[^\d.,]/g, '').replace(',', '.') || '0');
          product.img = scrapedData.images?.[0] || '';
          product.status = 'scraped';

          // Step 3: Fetch QC images automatically
          const qcImages = await fetchQCImages(originalUrl);
          product.qcImages = qcImages.slice(0, 10); // Limit to 10 images
          console.log(`QC Images for ${product.nombre}:`, product.qcImages);
        } else {
          product.status = 'error';
          console.error(`Error scraping ${kakobuyUrl}:`, scrapingResult.error || 'Unknown error');
        }

        setProducts(prev => prev.map(p => p.id === productId ? { ...product } : p));

      } catch (error) {
        product.status = 'error';
        console.error(`Error processing ${originalUrl}:`, error);
        setProducts(prev => prev.map(p => p.id === productId ? { ...product } : p));
      }
    }

    setLoading(false);
    toast({
      title: "Procesamiento completado",
      description: `Se procesaron ${urlList.length} URLs`,
    });
  };

  const updateProduct = (id: string, field: keyof ProductToAdd, value: any) => {
    setProducts(prev => prev.map(p =>
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const removeProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleOpenQCModal = (product: ProductToAdd) => {
    setSelectedProductForQC(product);
    setQcModalOpen(true);
  };

  const handleCloseQCModal = () => {
    setQcModalOpen(false);
    setSelectedProductForQC(null);
  };

  const handleSelectQCImage = (imageUrl: string) => {
    if (selectedProductForQC) {
      updateProduct(selectedProductForQC.id, 'img', imageUrl);
      toast({
        title: "Imagen QC seleccionada",
        description: "La imagen de control de calidad ha sido aplicada al producto.",
      });
    }
  };

  const addProductsToDatabase = async () => {
    const validProducts = products.filter(p => 
      p.status === 'scraped' && 
      p.nombre && 
      p.precio > 0 && 
      p.img && 
      p.categoria
    );

    if (validProducts.length === 0) {
      toast({
        title: "No hay productos válidos para agregar",
        description: "Asegúrate de que todos los productos tengan nombre, precio, imagen y categoría.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Add products to database
      for (const product of validProducts) {
        const productData = {
          nombre: product.nombre,
          precio: product.precio,
          img: product.img,
          categoria: product.categoria,
          links: {
            KakoBuy: product.kakobuyUrl
          }
        };

        const response = await fetch('/api/products/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(productData)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Error adding product ${product.nombre}`);
        }
      }

      toast({
        title: "Productos agregados exitosamente",
        description: `Se agregaron ${validProducts.length} productos a la base de datos.`,
      });

      // Clear products after successful addition
      setProducts([]);
    } catch (error) {
      console.error('Error adding products to DB:', error);
      toast({
        title: "Error al agregar productos",
        description: error instanceof Error ? error.message : 'Ocurrió un error desconocido.',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: ProductToAdd['status']) => {
    const labels = {
      pending: "Pendiente",
      scraping: "Scrapeando...",
      scraped: "Completado",
      error: "Error",
    };
    const variants: Record<ProductToAdd['status'], "default" | "destructive" | "secondary" | "success" | "outline"> = {
      pending: "secondary",
      scraping: "default",
      scraped: "success",
      error: "destructive",
    };
    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background container mx-auto p-6 max-w-6xl" style={{ scrollbarGutter: 'stable' }}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Scraping de Productos</h1>
        <p className="text-muted-foreground">
          Extrae información de productos desde múltiples plataformas usando Kakobuy
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Ingresar URLs de Productos</CardTitle>
          <CardDescription>
            Pega una o varias URLs de productos (una por línea) de Weidian, 1688, Taobao, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Ej:&#10;https://weidian.com/item.html?itemID=7565960512&#10;https://detail.1688.com/offer/787638895336.html"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={5}
            disabled={loading}
          />
          <Button onClick={processUrls} disabled={loading || !urls.trim()}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" /> Procesar URLs
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {products.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Productos Procesados ({products.length})</h2>

          {products.map((product) => (
            <Card key={product.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">#{products.indexOf(product) + 1}</h3>
                    {getStatusBadge(product.status)}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeProduct(product.id)}
                    disabled={loading}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {/* Product Information */}
                <div className="flex gap-4">
                  {/* Image */}
                  {product.img && (
                    <div className="flex-shrink-0">
                      <div className="w-20 h-20 border rounded-md overflow-hidden">
                        <img
                          src={product.img}
                          alt={product.nombre}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Form Fields */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                      <Input
                        value={product.nombre}
                        onChange={(e) => updateProduct(product.id, 'nombre', e.target.value)}
                        placeholder="Nombre del producto"
                        disabled={loading}
                        className="h-8 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Precio (CNY) *</label>
                      <Input
                        type="number"
                        value={product.precio}
                        onChange={(e) => updateProduct(product.id, 'precio', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        disabled={loading}
                        className="h-8 text-sm"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Categoría *</label>
                      <div className="flex flex-wrap gap-2">
                        {CATEGORIAS.map((categoria) => (
                          <Button
                            key={categoria}
                            type="button"
                            variant={product.categoria === categoria ? "default" : "outline"}
                            size="sm"
                            onClick={() => updateProduct(product.id, 'categoria', categoria)}
                            disabled={loading}
                            className="h-7 text-xs"
                          >
                            {categoria}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* QC Image Button */}
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenQCModal(product)}
                    disabled={loading || !product.qcImages || product.qcImages.length === 0}
                    className="text-xs"
                  >
                    {product.qcImages && product.qcImages.length > 0 
                      ? `Cambiar imagen a QC (${product.qcImages.length})`
                      : 'No se encontraron QC'
                    }
                  </Button>
                </div>

                {/* Error Message */}
                {product.status === 'error' && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription className="text-xs">
                      Error al procesar este producto. Verifica que la URL sea válida.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end">
            <Button onClick={addProductsToDatabase} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Agregando...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" /> Agregar a Base de Datos
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* QC Image Modal */}
      {selectedProductForQC && (
        <QCImageModal
          isOpen={qcModalOpen}
          onClose={handleCloseQCModal}
          onSelectImage={handleSelectQCImage}
          productUrl={selectedProductForQC.originalUrl}
          productName={selectedProductForQC.nombre}
          qcImages={selectedProductForQC.qcImages}
        />
      )}
    </div>
  );
}

