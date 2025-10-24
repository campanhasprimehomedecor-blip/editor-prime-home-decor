import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { editImageWithPrompt } from './services/geminiService';
import { fileToBase64, cropImage, padImage } from './utils/fileUtils';
import { UploadIcon, SparklesIcon, ImageIcon, DownloadIcon, PaperclipIcon, XIcon } from './components/Icons';

// Simple aspect ratio parser (e.g., "16:9" -> 16/9)
const parseAspectRatio = (ratioStr: string): number | null => {
  if (ratioStr === 'original') return null;
  const parts = ratioStr.split(':');
  if (parts.length !== 2) return null;
  const width = parseFloat(parts[0]);
  const height = parseFloat(parts[1]);
  if (isNaN(width) || isNaN(height) || height === 0) return null;
  return width / height;
};

interface HistoryItem {
  url: string; // Blob URL for easy display
  base64: string;
  mimeType: string;
  dimensions: { width: number; height: number };
}

const App: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState<number | null>(null);

  const [prompt, setPrompt] = useState<string>(() => localStorage.getItem('geminiImageEditor.prompt') || '');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>(() => localStorage.getItem('geminiImageEditor.aspectRatio') || 'original');
  const [quality, setQuality] = useState<string>('standard');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedImageBase64, setAttachedImageBase64] = useState<string | null>(null);
  const [attachedImageMimeType, setAttachedImageMimeType] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string | null>(null);
  const [attachedImageDimensions, setAttachedImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // State for cropping
  const [crop, setCrop] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachedFileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const cropInteractionRef = useRef<{
    isDragging: boolean;
    isResizing: boolean;
    startX: number;
    startY: number;
    startCrop: { x: number; y: number; width: number; height: number } | null;
  }>({ isDragging: false, isResizing: false, startX: 0, startY: 0, startCrop: null });
  
  const currentImage = useMemo(() => 
    activeHistoryIndex !== null ? history[activeHistoryIndex] : null,
    [history, activeHistoryIndex]
  );

  // Save prompt and aspect ratio to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('geminiImageEditor.prompt', prompt);
  }, [prompt]);

  useEffect(() => {
    localStorage.setItem('geminiImageEditor.aspectRatio', aspectRatio);
  }, [aspectRatio]);

  const resetState = useCallback(() => {
    setHistory([]);
    setActiveHistoryIndex(null);
    setError(null);
    setCrop(null);
    setIsCropping(false);
    setPrompt('');
    setAspectRatio('original');
    setQuality('standard');
    removeAttachedImage();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);
  
  const handleFileChange = useCallback(async (file: File | null) => {
    if (file) {
      if (file.size > 4 * 1024 * 1024) { // 4MB limit
        setError('O tamanho do arquivo não pode exceder 4MB.');
        return;
      }
      resetState();
      
      const imageUrl = URL.createObjectURL(file);
      const base64 = await fileToBase64(file);
      
      const image = new Image();
      image.onload = () => {
        const newHistoryItem: HistoryItem = {
            url: imageUrl,
            base64: base64,
            mimeType: file.type,
            dimensions: { width: image.width, height: image.height },
        };
        setHistory([newHistoryItem]);
        setActiveHistoryIndex(0);
        setError(null);
      };
      image.src = imageUrl;
    }
  }, [resetState]);
  
  const handleHistorySelect = (index: number) => {
    if (isLoading) return;
    setActiveHistoryIndex(index);
    setCrop(null);
    setIsCropping(false);
  }

  // Effect to initialize cropping when aspect ratio changes
  useEffect(() => {
    let targetAspectRatio: number | null = null;
    if (aspectRatio === 'reference' && attachedImageDimensions) {
        targetAspectRatio = attachedImageDimensions.width / attachedImageDimensions.height;
    } else if (aspectRatio !== 'original') {
        targetAspectRatio = parseAspectRatio(aspectRatio);
    }
    
    if (targetAspectRatio && currentImage && imageContainerRef.current) {
        const container = imageContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        
        const originalRatio = currentImage.dimensions.width / currentImage.dimensions.height;
        let renderedWidth, renderedHeight;

        if (originalRatio > containerRect.width / containerRect.height) {
            renderedWidth = containerRect.width;
            renderedHeight = containerRect.width / originalRatio;
        } else {
            renderedHeight = containerRect.height;
            renderedWidth = containerRect.height * originalRatio;
        }

        let cropWidth, cropHeight;

        if (targetAspectRatio > renderedWidth / renderedHeight) {
            cropWidth = renderedWidth;
            cropHeight = renderedWidth / targetAspectRatio;
        } else {
            cropHeight = renderedHeight;
            cropWidth = renderedHeight * targetAspectRatio;
        }

        setCrop({
            width: cropWidth,
            height: cropHeight,
            x: (renderedWidth - cropWidth) / 2,
            y: (renderedHeight - cropHeight) / 2,
        });
        setIsCropping(true);
    } else {
        setCrop(null);
        setIsCropping(false);
    }
  }, [aspectRatio, currentImage, attachedImageDimensions]);


  const handleAttachedFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) { // 4MB limit
        setError('O tamanho do arquivo anexado não pode exceder 4MB.');
        return;
      }
      setAttachedImageName(file.name);
      const imageUrl = URL.createObjectURL(file);
      setAttachedImage(imageUrl);

      const image = new Image();
      image.onload = () => {
        setAttachedImageDimensions({ width: image.width, height: image.height });
      };
      image.src = imageUrl;

      const base64 = await fileToBase64(file);
      setAttachedImageBase64(base64);
      setAttachedImageMimeType(file.type);
    }
  };
  
  const removeAttachedImage = () => {
    setAttachedImage(null);
    setAttachedImageBase64(null);
    setAttachedImageMimeType(null);
    setAttachedImageName(null);
    setAttachedImageDimensions(null);
    if (aspectRatio === 'reference') {
        setAspectRatio('original');
    }
    if(attachedFileInputRef.current) {
        attachedFileInputRef.current.value = "";
    }
  };

  const handleGenerateClick = async () => {
    if (!prompt || !currentImage) {
      setError("Por favor, carregue uma imagem e insira um comando.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let imageToSend = currentImage.base64;
      let mimeTypeToSend = currentImage.mimeType;
      let dimensionsToSend = currentImage.dimensions;

      if (isCropping && crop && currentImage.url) {
        const imageEl = new Image();
        imageEl.src = currentImage.url;
        await new Promise(resolve => { imageEl.onload = resolve; });

        const container = imageContainerRef.current;
        let renderedWidth = imageEl.width;
        let renderedHeight = imageEl.height;
        if(container){
            const originalRatio = imageEl.naturalWidth / imageEl.naturalHeight;
            const containerRect = container.getBoundingClientRect();
             if (originalRatio > containerRect.width / containerRect.height) {
                renderedWidth = containerRect.width;
                renderedHeight = containerRect.width / originalRatio;
            } else {
                renderedHeight = containerRect.height;
                renderedWidth = containerRect.height * originalRatio;
            }
        }
        
        const scaleX = imageEl.naturalWidth / renderedWidth;
        const scaleY = imageEl.naturalHeight / renderedHeight;

        const pixelCrop = {
          x: crop.x * scaleX,
          y: crop.y * scaleY,
          width: crop.width * scaleX,
          height: crop.height * scaleY,
        };
        
        const { base64: croppedBase64 } = await cropImage(currentImage.url, pixelCrop);

        let targetAspectRatioValue: number | null = null;
        if (aspectRatio === 'reference' && attachedImageDimensions) {
            targetAspectRatioValue = attachedImageDimensions.width / attachedImageDimensions.height;
        } else if (aspectRatio !== 'original') {
            targetAspectRatioValue = parseAspectRatio(aspectRatio);
        }

        if (targetAspectRatioValue) {
            const { base64: paddedBase64, dimensions: paddedDimensions } = await padImage(croppedBase64, targetAspectRatioValue);
            imageToSend = paddedBase64;
            mimeTypeToSend = 'image/png'; // The padded image is always a PNG with transparency
            dimensionsToSend = paddedDimensions;
        } else {
            const { base64: safeCroppedBase64, dimensions: safeCroppedDimensions } = await cropImage(currentImage.url, pixelCrop);
            imageToSend = safeCroppedBase64;
            mimeTypeToSend = 'image/png';
            dimensionsToSend = safeCroppedDimensions;
        }
      }

      const resultBase64 = await editImageWithPrompt(
        imageToSend,
        mimeTypeToSend,
        prompt,
        attachedImageBase64,
        attachedImageMimeType,
        dimensionsToSend,
        aspectRatio,
        quality,
        attachedImageDimensions
      );
      
      const resultUrl = `data:image/png;base64,${resultBase64}`;
      const newImage = new Image();
      newImage.onload = () => {
          const newHistoryItem: HistoryItem = {
              url: resultUrl,
              base64: resultBase64,
              mimeType: 'image/png',
              dimensions: { width: newImage.width, height: newImage.height },
          };
          
          const newHistory = history.slice(0, activeHistoryIndex! + 1);
          
          setHistory([...newHistory, newHistoryItem]);
          setActiveHistoryIndex(newHistory.length);
      };
      newImage.src = resultUrl;

    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro desconhecido.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) { handleFileChange(e.dataTransfer.files[0]); }
  };
  
  // --- CROP HANDLERS START ---
    const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>, isResizing = false) => {
        if (!crop || !imageContainerRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        
        const containerRect = imageContainerRef.current.getBoundingClientRect();
        
        cropInteractionRef.current = {
            isDragging: !isResizing,
            isResizing: isResizing,
            startX: e.clientX,
            startY: e.clientY,
            startCrop: { ...crop },
        };

        const onMouseMove = (moveEvent: MouseEvent) => handleCropMouseMove(moveEvent, containerRect);
        const onMouseUp = () => {
            cropInteractionRef.current.isDragging = false;
            cropInteractionRef.current.isResizing = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleCropMouseMove = (e: MouseEvent, containerRect: DOMRect) => {
        const { isDragging, isResizing, startX, startY, startCrop } = cropInteractionRef.current;
        if ((!isDragging && !isResizing) || !startCrop) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        let newCrop = { ...startCrop };
        
        let targetRatio: number | null = null;
        if (aspectRatio === 'reference' && attachedImageDimensions) {
          targetRatio = attachedImageDimensions.width / attachedImageDimensions.height;
        } else {
          targetRatio = parseAspectRatio(aspectRatio);
        }

        if (isDragging) {
            newCrop.x = startCrop.x + dx;
            newCrop.y = startCrop.y + dy;
        } else if (isResizing && targetRatio) {
            let newWidth = startCrop.width + dx;
            let newHeight = newWidth / targetRatio;

            if(startCrop.x + newWidth > containerRect.width) {
              newWidth = containerRect.width - startCrop.x;
              newHeight = newWidth / targetRatio;
            }
             if(startCrop.y + newHeight > containerRect.height) {
              newHeight = containerRect.height - startCrop.y;
              newWidth = newHeight * targetRatio;
            }
            if(newWidth < 20 || newHeight < 20) { // minimum size
                return;
            }
            newCrop.width = newWidth;
            newCrop.height = newHeight;
        }

        // Clamp to boundaries
        newCrop.x = Math.max(0, Math.min(newCrop.x, containerRect.width - newCrop.width));
        newCrop.y = Math.max(0, Math.min(newCrop.y, containerRect.height - newCrop.height));

        setCrop(newCrop);
    };
  // --- CROP HANDLERS END ---


  const downloadImage = () => {
    if (currentImage) {
      const link = document.createElement('a');
      link.href = currentImage.url;
      link.download = `edited-image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="min-h-screen font-sans">
      <header className="bg-neutral-900/50 backdrop-blur-sm border-b border-neutral-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold text-neutral-200 flex items-center">
              <SparklesIcon className="w-6 h-6 mr-2 text-primary-500" />
              Editor de Imagens Prime Home Decor
            </h1>
          </div>
        </div>
      </header>
      
      <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Coluna da Esquerda: Controles */}
        <div className="flex flex-col gap-6 sticky top-24">
           <h2 className="text-xl font-semibold text-neutral-300 border-b border-neutral-700 pb-2">1. Controles de Edição</h2>
          
          <fieldset disabled={!currentImage || isLoading} className="disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
            <div className="space-y-6">
              <div>
                <label htmlFor="prompt" className="block text-sm font-medium text-neutral-300 mb-2">Comando de Edição</label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex: adicione um chapéu de pirata no gato"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">Anexar Imagem de Referência (Opcional)</label>
                 <input type="file" ref={attachedFileInputRef} onChange={handleAttachedFileChange} accept="image/png, image/jpeg, image/webp" className="hidden"/>
                
                {attachedImage ? (
                  <div className="mt-2 flex items-center justify-between bg-neutral-900 p-2 rounded-lg border border-neutral-700">
                    <div className="flex items-center gap-3">
                      <img src={attachedImage} alt="Preview" className="w-12 h-12 rounded object-cover" />
                      <span className="text-sm text-neutral-300 truncate">{attachedImageName}</span>
                    </div>
                    <button onClick={removeAttachedImage} className="text-neutral-400 hover:text-neutral-200">
                      <XIcon className="w-5 h-5"/>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => attachedFileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-neutral-700 rounded-lg hover:border-primary-500 hover:bg-neutral-900/50 transition-colors text-neutral-400">
                    <PaperclipIcon className="w-5 h-5"/>
                    Anexar estilo ou objeto de referência
                  </button>
                )}
              </div>

              <div>
                <label htmlFor="aspect-ratio" className="block text-sm font-medium text-neutral-300 mb-2">Proporção da Imagem</label>
                <select
                  id="aspect-ratio"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                >
                  <option value="original">Original da Imagem Carregada</option>
                  {attachedImage && <option value="reference">Original da Imagem de Referência</option>}
                  <option value="1:1">Quadrado (1:1)</option>
                  <option value="16:9">Paisagem (16:9)</option>
                  <option value="9:16">Retrato (9:16)</option>
                  <option value="4:5">Social (4:5)</option>
                  <option value="3:1">Banner (3:1)</option>
                  <option value="7:2">Banner Black Prime (7:2)</option>
                </select>
              </div>

              <div>
                <label htmlFor="quality" className="block text-sm font-medium text-neutral-300 mb-2">Qualidade da Imagem</label>
                <select
                  id="quality"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                >
                  <option value="standard">Padrão</option>
                  <option value="high">Alta</option>
                  <option value="4k">4K (Ultra Alta Definição)</option>
                </select>
              </div>

              <button
                onClick={handleGenerateClick}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors disabled:bg-neutral-700 disabled:cursor-not-allowed"
              >
                <SparklesIcon className="mr-2 h-5 w-5" />
                Gerar Imagem
              </button>
            </div>
          </fieldset>
        </div>

        {/* Coluna da Direita: Imagem e Histórico */}
        <div className="flex flex-col gap-6 sticky top-24">
            <h2 className="text-xl font-semibold text-neutral-300 border-b border-neutral-700 pb-2">2. Imagem Atual</h2>
           <div 
             ref={imageContainerRef}
             className="w-full aspect-video bg-neutral-900 rounded-lg flex items-center justify-center overflow-hidden relative select-none"
             onDrop={handleDrop}
             onDragOver={handleDragOver}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
            />
            {isLoading && (
               <div className="absolute inset-0 bg-neutral-950 bg-opacity-70 flex flex-col items-center justify-center z-20">
                <svg className="animate-spin -ml-1 mr-3 h-8 w-8 text-neutral-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="mt-4 text-neutral-400">Gerando imagem... Isso pode levar um momento.</p>
              </div>
            )}
            {error && !isLoading && (
              <div className="p-4 text-center text-red-400">
                <p><strong>Erro:</strong> {error}</p>
              </div>
            )}
            {currentImage ? (
              <>
                <img
                  src={currentImage.url}
                  alt={`Versão ${activeHistoryIndex! + 1}`}
                  className="max-w-full max-h-full object-contain pointer-events-none"
                />
                 <button
                    onClick={resetState}
                    className="absolute top-2 right-2 bg-neutral-950 bg-opacity-50 text-neutral-200 rounded-full p-1.5 hover:bg-opacity-75 transition-opacity"
                    aria-label="Remover imagem e começar de novo"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                  {isCropping && crop && (
                     <div className="absolute inset-0">
                        {/* Shaded Overlays */}
                        <div className="absolute bg-black bg-opacity-60" style={{ top: 0, left: 0, right: 0, height: `${crop.y}px` }} />
                        <div className="absolute bg-black bg-opacity-60" style={{ bottom: 0, left: 0, right: 0, height: `calc(100% - ${crop.y + crop.height}px)` }} />
                        <div className="absolute bg-black bg-opacity-60" style={{ top: `${crop.y}px`, left: 0, width: `${crop.x}px`, height: `${crop.height}px` }} />
                        <div className="absolute bg-black bg-opacity-60" style={{ top: `${crop.y}px`, right: 0, width: `calc(100% - ${crop.x + crop.width}px)`, height: `${crop.height}px` }} />
                        {/* Crop Box */}
                        <div
                            className="absolute border-2 border-white border-dashed cursor-move"
                            style={{
                                transform: `translate(${crop.x}px, ${crop.y}px)`,
                                width: `${crop.width}px`,
                                height: `${crop.height}px`,
                            }}
                             onMouseDown={(e) => handleCropMouseDown(e, false)}
                        >
                             <div 
                                className="absolute -right-1 -bottom-1 w-4 h-4 bg-primary-500 rounded-full border-2 border-neutral-950 cursor-nwse-resize"
                                onMouseDown={(e) => handleCropMouseDown(e, true)}
                             />
                        </div>
                    </div>
                  )}
              </>
            ) : (
                !isLoading && !error && (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-full border-2 border-dashed border-neutral-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 hover:bg-neutral-900/50 transition-colors p-4 text-center"
                        aria-label="Área para carregar imagem"
                        role="button"
                    >
                        <UploadIcon className="w-12 h-12 text-neutral-500 mb-4" />
                        <p className="text-lg font-semibold text-neutral-400">Clique para carregar uma imagem</p>
                        <p className="text-neutral-500">ou arraste e solte aqui</p>
                        <p className="text-xs text-neutral-500 mt-2">PNG, JPG, WEBP (Máx. 4MB)</p>
                    </div>
                )
            )}
          </div>
          
            <h2 className="text-xl font-semibold text-neutral-300 border-b border-neutral-700 pb-2">3. Histórico de Edições</h2>
            <div className="w-full bg-neutral-900 rounded-lg p-4">
                {history.length > 0 ? (
                <div className="flex items-center gap-4 overflow-x-auto pb-2">
                    {history.map((item, index) => (
                    <div
                        key={index}
                        onClick={() => handleHistorySelect(index)}
                        className={`relative rounded-md overflow-hidden cursor-pointer flex-shrink-0 transition-all duration-200 ${activeHistoryIndex === index ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-neutral-900' : 'hover:scale-105 opacity-70 hover:opacity-100'}`}
                        style={{ width: '80px', height: '80px' }}
                        title={`Mudar para a Versão ${index + 1}`}
                    >
                        <img src={item.url} alt={`Versão ${index + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-xs text-center py-0.5">
                        V{index + 1}
                        </div>
                    </div>
                    ))}
                </div>
                ) : (
                <div className="text-center text-neutral-500 py-6">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                    <p>O histórico de edições aparecerá aqui.</p>
                </div>
                )}
            </div>
            {currentImage && !isLoading && (
            <button
              onClick={downloadImage}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors"
            >
              <DownloadIcon className="mr-2 h-5 w-5" />
              Baixar Imagem Atual
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;