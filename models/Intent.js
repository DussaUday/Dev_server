import mongoose from 'mongoose';

const intentSchema = new mongoose.Schema({
  category: String,
  topic: String,
  tags: [String],
  answer: [{
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return typeof v === 'string';
      },
      message: props => `${props.value} is not a valid string!`
    }
  }]
});

export default mongoose.model('Intent', intentSchema);