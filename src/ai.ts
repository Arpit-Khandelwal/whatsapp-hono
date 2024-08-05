export default async function callAI(prompt?:string, env){
  let response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
    prompt: "What is the origin of the phrase Hello, World",
  });

  console.log(response)
  return response
} 