const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model');
const { getProfile } = require('./middleware/getProfile');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);
const { Op } = require('sequelize');

/**
 * @params contractId
 * @header profile_id
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
  const { Contract } = req.app.get('models');
  const { id } = req.params;
  const profileId = req.profile.id;

  const contract = await Contract.findOne({ 
    where: { 
        id,
        [Op.or]: [
            { ClientId: profileId }, 
            { ContractorId: profileId }
        ]
    } 
  });
  
  if (!contract) { 
    return res.status(404).json({message: 'Not found'})
  } else {
    res.json(contract);
  }
});
module.exports = app;
