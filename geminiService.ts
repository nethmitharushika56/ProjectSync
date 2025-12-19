
import { GoogleGenAI, Type } from "@google/genai";
import { AIRecommendation } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export async function getProjectRoadmap(projectTitle: string, projectDesc: string): Promise<AIRecommendation> {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the following project and suggest 5 specific, actionable short-term goals to get started. Project: ${projectTitle}. Description: ${projectDesc}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestedGoals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] }
              },
              required: ['title', 'description', 'priority']
            }
          },
          advice: { type: Type.STRING }
        },
        required: ['suggestedGoals', 'advice']
      }
    }
  });

  try {
    return JSON.parse(response.text) as AIRecommendation;
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    throw new Error("AI analysis failed.");
  }
}
