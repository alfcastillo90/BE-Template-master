const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model');
const { getProfile } = require('./middleware/getProfile');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);
const { Op } = require('sequelize');
const { body, validationResult, query, param } = require('express-validator');

/**
 * @params contractId
 * @header profile_id
 * @returns contract by id
 */
app.get('/contracts/:id', param('id').isNumeric(), getProfile, async (req, res) => {
  const errors = validationResult(req);
    
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

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
    return res.json(contract);
  } else {
    return res.status(404).json({ message: 'No data' });
  }
});

/**
 * @header profile_id
 * @returns list of non-terminated contracts belonging to a user (client or contractor)
 */

app.get('/contracts/', getProfile, async (req, res) =>{
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
        return res.json(contracts);
      } else {
        return res.status(404).json({ message: 'No data' });
      }  
  } catch (error) {
    return res.status(500).json({ 
      message: error.message
    });
  }
});

/**
 * @header profile_id
 * @returns list of all unpaid jobs for a user (either a client or contractor), for active contracts only.
 */
app.get('/jobs/unpaid', getProfile, async (req, res) =>{
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
        return res.json(jobs);
      } else {
        return res.status(404).json({ message: 'No data' });
      }
  } catch (error) {
      return res.status(500).json({ message: error.message })
  }
});

/**
 * @params job_id
 * @header profile_id
 * @returns result true
 */

app.post('/jobs/:job_id/pay', param('job_id').isNumeric(), getProfile, async (req, res) =>{
  const errors = validationResult(req);
    
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  
  const sequelize = req.app.get('sequelize')
  const { Job, Contract, Profile } = req.app.get('models');
  const profileBalance = req.profile.balance;
  const profileId = req.profile.id;
  const jobId = req.params.job_id;

  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    if (profile.type !== 'client') {
      return res.status(422).json({
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
      return res.status(422).json({
          message: `There are not any jobs for client with profile id ${profileId}`
      })
    }
    const jobPrice = job.price;

    if(profileBalance < jobPrice) {
      return res.status(422).json({
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
      
    return res.status(200).json({
      result: true
    })
  } catch (error) {
      if (transaction) {
        await transaction.rollback()
      }

      return res.status(500).json({
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

app.post('/balances/deposit/:user_id', param('user_id').isNumeric(), body('amount').isNumeric(), getProfile, async (req, res) =>{
  const { Job, Contract, Profile } = req.app.get('models')
  const userId = req.params.user_id;
  const amount = req.body.amount;
  
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const profile = await Profile.findOne({ where: { id: userId } });

    if (profile.type !== 'client') {
      return res.status(422).json({
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
      return res.status(422).json({ message: `No jobs found` });
    } else {
      const maximumValue = result.toPay * 1.25;
      
      if (amount > maximumValue) {
        return res.status(422).json({ message: `A client can't deposit more than 25% his total of jobs to pay` });
      }

      await Profile.increment('balance', { by: amount, where: { id: userId } })
      const updatedProfile = await Profile.findOne({where: {id: userId}})
  
      return res.json(updatedProfile)
    }
      
  } catch (error) {
    return res.status(500).json({
      message: error.message
    })
  }
});

/**
 * @params start: start date
 * @params end: end date
 * @header profile_id
 * @returns { totalEarned, professional }
 */

app.get('/admin/best-profession', query('start').isDate(), query('end').isDate(), getProfile, async (req, res) =>{
  const { start, end } = req.query
  const { Job, Contract } = req.app.get('models')
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    
    const [job] = await Job.findAll({
        attributes: [[fn('SUM', col('price')), 'totalEarned']],
        include: [{
            model: Contract,
            required: true,
            include: [
                {
                    model: Profile,
                    required: true,
                    as: 'Contractor'
                }
            ]
        }],
        where: {
            paymentDate: { [Op.between]: [start, end] },
            paid: true
        },
        group: ['Contract.ContractorId'],
        order: [[col('totalEarned'), 'DESC']],
        limit: 1
    });

    if (!job) {
      return res.status(422).json({ message: `No jobs found` });
    } else {
      return res.json({
        totalEarned: result.dataValues.totalEarned,
        professional: result.dataValues.Contract.Contractor
      }) 
    }
  } catch (error) {
    return res.status(500).json({
      message: error.message
    })
  }
});

/**
 * @params start: start date
 * @params end: end date
 * @params limit: default 2
 * @header profile_id
 * @returns {totalEarned, professional }
 */
app.get('/admin/best-clients', query('start').isDate(), query('end').isDate(), getProfile, async (req, res) =>{
  const { start, end, limit = 2 } = req.query;
  const { Job, Contract } = req.app.get('models');

  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    
    const job = await Job.findAll({
        raw: true,
        attributes: [[fn('SUM', col('price')), 'totalPaid']],
        include: [{
            model: Contract,
            required: true,
            include: [
                {
                    model: Profile,
                    required: true,
                    as: 'Client'
                }
            ]
        }],
        where: {
            paymentDate: { [Op.between]: [start, end] },
            paid: true
        },
        group: ['Contract.ClientId'],
        order: [[col('totalPaid'), 'DESC']],
        limit
    });
    
    if (!job) {
      return res.status(422).json({ message: `No jobs found` });
    } else {
      return res.json(
        results.map(job => ({
          id: job.Contract.Client.id,
          fullName: `${job.Contract.Client.firstName} ${job.Contract.Client.lastName}`,
          paid: job.totalPaid,
        })
      ));
    }
    
} catch (error) {
  return res.status(500).json({
    message: error.message
  })
}
})


module.exports = app;
