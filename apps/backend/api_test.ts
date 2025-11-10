import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

async function testAPI() {
  try {
    console.log("Testing Gemini API...");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const result = await model.generateContent("Say hello in one word");
    console.log("Response:", result.response.text());
    console.log("API is working!");
    
  } catch (error: any) {
    console.error("API Error:", error.message);
    
    if (error.message.includes("quota")) {
      console.error("QUOTA EXCEEDED - API limit reached");
    } else if (error.message.includes("INVALID_ARGUMENT")) {
      console.error("INVALID API KEY");
    } else if (error.message.includes("permission")) {
      console.error("PERMISSION DENIED - Check API key access");
    } else {
      console.error("Full error:", error);
    }
  }
}

testAPI();
