import { GoogleGenAI, Type } from '@google/genai';
import * as mammoth from 'mammoth';
import { fileToBase64 } from './utils';

let ai: GoogleGenAI | null = null;

export const generateScript = async (
  idea: string,
  audience: string,
  style: string,
  duration: string,
  files: File[]
) => {
  if (!ai) {
    // Hardcoded API Key as requested by the user for automatic deployment
    const apiKey = "AIzaSyAPUKMMUXwkIpka9dou-CxnCKuv0bPddnM";
    ai = new GoogleGenAI({ apiKey });
  }

  const parts: any[] = [];

  let promptText = `Bạn là hội đồng chuyên gia master top 0.1% thế giới về giáo dục, biên kịch và đạo diễn.
Nhiệm vụ của bạn là xây dựng kịch bản câu chuyện chuyên nghiệp, truyền cảm hứng để mở đầu cho tiết học.

Thông tin yêu cầu:
- Ý tưởng: ${idea}
- Đối tượng học sinh: ${audience}
- Phong cách: ${style}
- Tỉ lệ khung hình: 16:9
- Chất lượng độ phân giải: 8K
- Thời lượng dự kiến: ${duration || 'Tự điều chỉnh cho phù hợp với nội dung'}

Yêu cầu đầu ra:
1. Tạo prompt chi tiết để tạo hình ảnh nhân vật đồng nhất xuyên suốt tất cả các phân cảnh trên công cụ "nano banana" (Gemini 2.5 Flash Image).
2. Tạo kịch bản video chia thành các phân cảnh chi tiết. Cung cấp 2 phiên bản prompt tạo video:
   - Phiên bản Veo3: mỗi phân cảnh tối đa 8 giây.
   - Phiên bản Grok: mỗi phân cảnh tối đa 10 giây.
   *LƯU Ý QUAN TRỌNG VỀ THOẠI VÀ THỜI GIAN*: Nếu thoại ngắn, HÃY KẾT HỢP nhiều câu thoại hoặc nhiều nhân vật nói vào CÙNG MỘT phân cảnh sao cho tổng thời gian không vượt quá thời gian tối đa của phân cảnh (8s hoặc 10s). Đảm bảo các nhân vật nói lần lượt, không bị chồng tiếng, và không bị ngắt ý của câu.
   *LƯU Ý QUAN TRỌNG VỀ ĐỒNG BỘ*: Khi xuất hiện nhân vật trong cảnh nào thì BẮT BUỘC phải đưa lại toàn bộ mô tả chi tiết ngoại hình và mô tả chi tiết giọng nói của (các) nhân vật đó vào JSON của phân cảnh đó (ghi rõ trong trường 'character' và 'voice') để đồng bộ tuyệt đối. Nếu cảnh có nhiều nhân vật, liệt kê đầy đủ mô tả ngoại hình và giọng nói của từng nhân vật.
3. Viết toàn bộ lời thuyết minh (voiceover) cho video câu chuyện.
4. Liệt kê tài liệu tham khảo hoặc ghi chú (nếu có).

Hãy trả về kết quả dưới dạng JSON theo đúng schema được yêu cầu.`;

  parts.push({ text: promptText });

  for (const file of files) {
    if (file.type.startsWith('image/') || file.type === 'application/pdf') {
      const base64 = await fileToBase64(file);
      parts.push({
        inlineData: {
          data: base64,
          mimeType: file.type
        }
      });
    } else if (file.name.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      parts.push({ text: `\nNội dung tài liệu tham khảo (${file.name}):\n${result.value}` });
    } else if (file.type === 'text/plain') {
      const text = await file.text();
      parts.push({ text: `\nNội dung tài liệu tham khảo (${file.name}):\n${text}` });
    }
  }

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      imagePrompts: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            characterName: { type: Type.STRING },
            nanoBananaPrompt: { type: Type.STRING, description: "Prompt chi tiết cho nano banana (tiếng Anh hoặc tiếng Việt), đảm bảo 8K, 16:9, phong cách " + style }
          },
          required: ["characterName", "nanoBananaPrompt"]
        }
      },
      videoScript: {
        type: Type.OBJECT,
        properties: {
          veo3: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scene: { type: Type.INTEGER },
                timeline: { type: Type.STRING },
                context: { type: Type.STRING },
                action: { type: Type.STRING },
                character: { type: Type.STRING, description: "Mô tả chi tiết ngoại hình của TẤT CẢ nhân vật xuất hiện trong cảnh này (phải lặp lại mô tả để đồng bộ tuyệt đối)" },
                voice: { type: Type.STRING, description: "Mô tả chi tiết giọng nói của TẤT CẢ nhân vật xuất hiện trong cảnh này (phải lặp lại mô tả để đồng bộ tuyệt đối)" },
                dialogue: { type: Type.STRING },
                prompt: { type: Type.STRING, description: "Prompt chi tiết cho Veo3 (tối đa 8s), đảm bảo 8K, 16:9, phong cách " + style }
              },
              required: ["scene", "timeline", "context", "action", "character", "voice", "dialogue", "prompt"]
            }
          },
          grok: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scene: { type: Type.INTEGER },
                timeline: { type: Type.STRING },
                context: { type: Type.STRING },
                action: { type: Type.STRING },
                character: { type: Type.STRING, description: "Mô tả chi tiết ngoại hình của TẤT CẢ nhân vật xuất hiện trong cảnh này (phải lặp lại mô tả để đồng bộ tuyệt đối)" },
                voice: { type: Type.STRING, description: "Mô tả chi tiết giọng nói của TẤT CẢ nhân vật xuất hiện trong cảnh này (phải lặp lại mô tả để đồng bộ tuyệt đối)" },
                dialogue: { type: Type.STRING },
                prompt: { type: Type.STRING, description: "Prompt chi tiết cho Grok (tối đa 10s), đảm bảo 8K, 16:9, phong cách " + style }
              },
              required: ["scene", "timeline", "context", "action", "character", "voice", "dialogue", "prompt"]
            }
          }
        },
        required: ["veo3", "grok"]
      },
      voiceover: { type: Type.STRING },
      references: { type: Type.STRING }
    },
    required: ["imagePrompts", "videoScript", "voiceover"]
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
      temperature: 0.7,
    }
  });

  return JSON.parse(response.text || '{}');
};
