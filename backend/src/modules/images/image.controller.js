const Image = require('./image.model');
const mongoose = require('mongoose');

const getImage = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send('Invalid image ID');
    }
    
    const image = await Image.findById(id);
    if (!image) {
      return res.status(404).send('Image not found');
    }
    
    res.set('Content-Type', image.contentType);
    res.send(image.data);
  } catch (error) {
    next(error);
  }
};

const saveImageToDB = async (file) => {
  if (!file || !file.buffer) return null;
  const image = await Image.create({
    filename: file.originalname || 'image.png',
    contentType: file.mimetype || 'image/png',
    data: file.buffer
  });
  return `images/${image._id}`;
};

module.exports = {
  getImage,
  saveImageToDB
};
