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
});

/**
 * @header profile_id
 * @returns list of all unpaid jobs for a user (either a client or contractor), for active contracts only.
 */
app.get('/jobs/unpaid',getProfile ,async (req, res) =>{
  const {Job, Contract} = req.app.get('models');
  const profileId = req.profile.id;
  try {
    const jobs = await Job.findAll({
      include: [{
          attributes: [],
          model: Contract,
          required: true,
          where: {
              [Op.or]: [
                  { ClientId: profileId }, 
                  { ContractorId: profileId }
              ]
          }
      }],
      where: {
          paid: null,  // even though default is false it shows up as null
      }
    })

      if(jobs.length > 0) {
        res.json(jobs);
      } else {
        res.status(404).json({ message: 'No data' });
      }
  } catch (error) {
      res.status(500).json({ message: error.message })
  }
});

/**
 * @params job_id
 * @header profile_id
 * @returns result true
 */

app.post('/jobs/:job_id/pay',getProfile ,async (req, res) =>{
  const sequelize = req.app.get('sequelize')
  const { Job, Contract, Profile } = req.app.get('models');
  const profileBalance = req.profile.balance;
  const profileId = req.profile.id;
  const jobId = req.params.job_id;

  try {
    if (profile.type !== 'client') {
      res.status(422).json({
        message: 'This operation is just available for clients'
      })
    }

    const job = await Job.findOne({
        include: [{
            model: Contract,
            required: true,
            where: { ClientId: profileId }
        }],
        where: {id: jobId}
    });

    if(!job) {
      res.status(422).json({
          message: `There are not any jobs for client with profile id ${profileId}`
      })
    }
    const jobPrice = job.price;

    if(profileBalance < jobPrice) {
      res.status(422).json({
        message: `Profile balance amount must be major than job price`
      })
    }
  
    const transaction = await sequelize.transaction();
    
    await Promise.all([
      Job.update({paid: true, paymentDate: new Date()}, {where: {id: jobId}, transaction}),
      Profile.increment('balance', {by: job.price, where: { id: job.Contract.ContractorId}, transaction}),
      Profile.decrement('balance', {by: job.price, where: { id: job.Contract.ClientId}, transaction})
    ]);
    
    await transaction.commit()
      
    res.status(200).json({
      result: true
    })
  } catch (error) {
      if (transaction) {
        await transaction.rollback()
      }

      res.status(500).json({
        message: error.message
      })
  }
});

/**
 * @params user_id
 * @body amount
 * @header profile_id
 * @returns Profile
 */

app.post('/balances/deposit/:user_id', async (req, res) =>{
  const { Job, Contract, Profile } = req.app.get('models')
  const userId = req.params.user_id;
  const amount = req.body.amount;
  
  try {
    const profile = await Profile.findOne({ where: { id: userId } });

    if (profile.type !== 'client') {
      res.status(422).json({
        message: 'This operation is just available for clients'
      })
    }

    const job = await Job.findOne({
        attributes: [[fn('SUM', col('price')), 'toPay']],
        raw: true,
        include: [{
            attributes: [],
            model: Contract,
            required: true,
            where: { ClientId: profile.id }
        }],
        where: {
            paid: null
        },
        group: ['Contract.ClientId']
    });

    if (!job) {
      res.status(422).json({ message: `No jobs found` });
    } else {
      const maximumValue = result.toPay * 1.25;
      
      if (amount > maximumValue) {
        res.status(422).json({ message: `A client can't deposit more than 25% his total of jobs to pay` });
      }

      await Profile.increment('balance', { by: amount, where: { id: userId } })
      const updatedProfile = await Profile.findOne({where: {id: userId}})
  
      res.json(updatedProfile)
    }
      
  } catch (error) {
      res.status(500).end()
  }
})


module.exports = app;
