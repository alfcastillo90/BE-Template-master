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
  
  if (contract) { 
    res.json(contract);
  } else {
    res.status(404).json({ message: 'No data' });
  }
});

/**
 * @params contractId
 * @header profile_id
 * @returns list of non-terminated contracts belonging to a user (client or contractor)
 */

app.get('/contracts/',getProfile ,async (req, res) =>{
  const { Contract } = req.app.get('models')
  const profileId = req.profile.id
  try {
      const contracts = await Contract.findAll({
          where: {
              [Op.or]: [
                  { ClientId: profileId }, 
                  { ContractorId: profileId }
              ],
              [Op.not]: { status: 'terminated' }, 
          }
      });

      if(contracts.length > 0) {
        res.json(contracts);
      } else {
        res.status(404).json({ message: 'No data' });
      }  
  } catch (error) {
    res.status(500).json({ 
      message: error.message
    });
  }
})


module.exports = app;
