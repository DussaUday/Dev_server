import Intent from '../models/Intent.js';

async function getResponse(msg) {
  const intents = await Intent.find({});
  // Simple keyword matching (replace with your NLP logic)
  const matchedIntent = intents.find(intent => 
    intent.tags.some(tag => msg.toLowerCase().includes(tag.toLowerCase()))
  ) || { answer: "It is out of my scope, Please try asking something else." };

  return matchedIntent.answer;
}

export default getResponse;
