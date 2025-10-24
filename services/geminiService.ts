import { GoogleGenAI, Modality } from "@google/genai";

export async function editImageWithPrompt(
  base64ImageData: string, 
  mimeType: string, 
  prompt: string,
  attachedImageBase64: string | null,
  attachedImageMimeType: string | null,
  dimensions: { width: number, height: number },
  aspectRatio: string,
  quality: string,
  attachedImageDimensions: { width: number, height: number } | null
): Promise<string> {
  if (!process.env.API_KEY) {
    throw new Error("A variável de ambiente API_KEY não está definida.");
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const parts: ({ text: string } | { inlineData: { data: string; mimeType: string; } })[] = [];

  // 1. Adicionar imagem original (que pode estar recortada e/ou com preenchimento)
  parts.push({
    inlineData: {
      data: base64ImageData,
      mimeType: mimeType,
    },
  });

  // 2. Adicionar imagem de referência, se existir
  if (attachedImageBase64 && attachedImageMimeType) {
    parts.push({
      inlineData: {
        data: attachedImageBase64,
        mimeType: attachedImageMimeType,
      },
    });
  }

  // 3. Determinar instruções de qualidade
  let qualityInstruction: string;
  let qualityInstructionFromPrompt = '';

  if (quality === 'high') {
    qualityInstruction = `Gere a imagem com a mais alta fidelidade possível, preservando detalhes nítidos e evitando artefatos visuais ou de compressão.`;
  } else if (quality === '4k') {
    qualityInstruction = `Gere a imagem com detalhes fotorrealistas e a mais alta resolução possível. Foque em texturas complexas, iluminação realista e renderização nítida, como se fosse para uma tela 4K.`;
  }
  else {
    qualityInstruction = '';
  }
  
  const lowerCasePrompt = prompt.toLowerCase();
  
  const qualityKeywords = [
      'melhore a qualidade', 'aumente a qualidade', 'alta resolução', 'mais nítido',
      'mais detalhes', 'qualidade 4k', 'ultra realista', 'fotorrealista',
      'hd', 'uhd', 'deixe mais real', 'melhorar a imagem'
  ];

  if (qualityKeywords.some(keyword => lowerCasePrompt.includes(keyword))) {
      qualityInstructionFromPrompt = `O usuário solicitou um aumento explícito na qualidade. Priorize a geração da imagem com o máximo de detalhes, nitidez, clareza e fotorrealismo possível.`;
  }
  
  // 4. Montar o prompt final com base na nova estratégia de outpainting
  const promptLines = [];
  const isOutpaintingTask = aspectRatio !== 'original';

  // Linha 1: A regra de dimensão, que agora é muito mais direta.
  if (isOutpaintingTask) {
    // A imagem enviada tem áreas transparentes que precisam ser preenchidas.
    const dimensionRule = `**REGRA INQUEBRÁVEL:** A imagem final DEVE ter EXATAMENTE as mesmas dimensões da PRIMEIRA imagem fornecida (${dimensions.width}x${dimensions.height} pixels). A primeira imagem contém áreas transparentes. Sua tarefa é preencher essas áreas transparentes de forma criativa e realista, criando uma continuação natural da imagem existente. O resultado final NÃO PODE ter nenhuma área transparente.`;
    promptLines.push(dimensionRule);
  } else {
    // Tarefa de edição padrão, sem alteração de proporção.
    const dimensionRule = `**REGRA INQUEBRÁVEL:** A imagem final DEVE ter EXATAMENTE as mesmas dimensões e proporção da PRIMEIRA imagem fornecida (${dimensions.width}x${dimensions.height} pixels). É PROIBIDO cortar, redimensionar ou alterar a proporção original.`;
    promptLines.push(dimensionRule);
  }

  // Linha 2: A tarefa de edição principal.
  let editTask: string;
  if (isOutpaintingTask) {
    editTask = `**TAREFA DE EDIÇÃO:** Dentro da área já visível (não-transparente) da primeira imagem, aplique a seguinte edição: "${prompt}". Se o comando for genérico (ex: "melhore a imagem"), aplique-o em toda a cena final.`;
  } else {
    editTask = `**TAREFA DE EDIÇÃO:** Edite a PRIMEIRA imagem com base no seguinte comando: "${prompt}".`;
  }
  promptLines.push(editTask);

  // Linha 3: O aviso sobre a imagem de referência, se houver.
  if (attachedImageBase64) {
    const referenceRule = `**AVISO:** A SEGUNDA imagem é apenas para referência de estilo ou objeto. IGNORE TOTALMENTE as suas dimensões e proporção. A única regra de dimensões válida é a 'REGRA INQUEBRÁVEL' acima.`;
    promptLines.push(referenceRule);
  }

  // Linha 4: Instruções de qualidade.
  const qualityText = [qualityInstruction, qualityInstructionFromPrompt].filter(Boolean).join(' ');
  if (qualityText) {
    promptLines.push(`**QUALIDADE:** ${qualityText}`);
  }

  const enhancedPrompt = promptLines.join('\n\n');

  // 5. Adicionar o prompt de texto final compilado
  parts.push({
    text: enhancedPrompt,
  });
  
  // 6. Fazer a chamada para a API
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: parts },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }

    throw new Error("Nenhuma imagem foi gerada na resposta.");

  } catch (error) {
    console.error("A chamada da API Gemini falhou:", error);
    if (error instanceof Error) {
        if (error.message.includes('SAFETY')) {
            return Promise.reject(new Error("A solicitação foi bloqueada por configurações de segurança. Por favor, modifique seu comando ou imagem."));
        }
    }
    return Promise.reject(error);
  }
}