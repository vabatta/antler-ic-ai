import { OpenAIStream, OpenAIStreamPayload } from "@/utils/OpenAIStream";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing env var from OpenAI");
}

export const config = {
  runtime: "edge",
};

const handler = async (req: Request): Promise<Response> => {
  const { prompt, startupDescription } = (await req.json()) as {
    prompt?: string;
    startupDescription?: string;
  };

  if (!prompt || !startupDescription) {
    return new Response("No prompt/description in the request", { status: 400 });
  }

  const payload: OpenAIStreamPayload = {
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content:
          `You are a member of the Y Combinator Investment Committee, a prominent venture capital firm. You are reviewing a startup's funding application.Do not be overly verbose.Your aim is to assess the startup's viability and whether you will invest in it. Here is a startup's description: ${startupDescription}`
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 450,
    stream: true,
    n: 1,
  };

  const stream = await OpenAIStream(payload);
  return new Response(stream);
};

export default handler;
