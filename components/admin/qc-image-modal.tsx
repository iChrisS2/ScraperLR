"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Image as ImageIcon, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface QCImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (imageUrl: string) => void;
  productUrl: string;
  productName: string;
  qcImages?: string[]; // Optional prop to pass already fetched QC images
}

interface QCImage {
  url: string;
  thumbnail?: string;
}

export function QCImageModal({ isOpen, onClose, onSelectImage, productUrl, productName, qcImages }: QCImageModalProps) {
  const [images, setImages] = useState<QCImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { toast } = useToast();

  // Use provided QC images or fetch them if not provided
  useEffect(() => {
    if (isOpen) {
      if (qcImages && qcImages.length > 0) {
        // Use provided QC images
        setImages(qcImages.map(url => ({ url })));
        setLoading(false);
      } else {
        // Fetch QC images if not provided
        fetchQCImages();
      }
    }
  }, [isOpen, qcImages]);

  const fetchQCImages = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/qc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ goodsUrl: productUrl }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch QC images');
      }

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // Extract all images from galleries
        const images = data.galleries?.flatMap((gallery: any) =>
          gallery.images?.map((img: any) => ({ url: img.image_url })) || []
        ) || [];
        setImages(images);
      } else {
        setImages([]);
        toast({
          title: "No se encontraron imágenes QC",
          description: "No hay imágenes de control de calidad disponibles para este producto.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error fetching QC images:', error);
      setImages([]);
      toast({
        title: "Error al cargar imágenes QC",
        description: "Ocurrió un error al intentar cargar las imágenes de control de calidad.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = () => {
    if (selectedImage) {
      onSelectImage(selectedImage);
      onClose();
    } else {
      toast({
        title: "Ninguna imagen seleccionada",
        description: "Por favor, selecciona una imagen de control de calidad.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Seleccionar Imagen QC para "{productName}"</DialogTitle>
          <DialogDescription>
            Elige una imagen de control de calidad para reemplazar la imagen actual del producto.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Cargando imágenes QC...</span>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mb-4" />
            <p>No se encontraron imágenes de control de calidad para este producto.</p>
            <Button onClick={fetchQCImages} variant="outline" className="mt-4">
              Reintentar búsqueda
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 py-4">
            {images.map((img, index) => (
              <div
                key={index}
                className={`relative w-full aspect-square border rounded-md overflow-hidden cursor-pointer
                            ${selectedImage === img.url ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-muted-foreground'}`}
                onClick={() => setSelectedImage(img.url)}
              >
                <img
                  src={img.url}
                  alt={`QC Image ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {selectedImage === img.url && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/50 text-primary-foreground">
                    <Check className="h-8 w-8" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSelect} disabled={!selectedImage}>
            Seleccionar Imagen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}