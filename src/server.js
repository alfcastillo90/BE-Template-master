const app = require('./app');
require('dotenv').config();
init();

async function init() {
  try {
    const port = process.env.PORT;

    app.listen(port, () => {
      console.log(`Express App Listening on Port ${port}`);
    });
  } catch (error) {
    console.error(`An error occurred: ${JSON.stringify(error)}`);
    process.exit(1);
  }
}
