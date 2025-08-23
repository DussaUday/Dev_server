import Intent from '../models/Intent.js';
import  getResponse  from '../utils/chatUtils.js';

const getChatResponse = async (req, res) => {
  try {
    const { message } = req.body;
    const response = await getResponse(message);
    res.json({ answer: response });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

export default getChatResponse;
