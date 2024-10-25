const postgres = require('postgres');
require('dotenv').config();
const sql = postgres({
  
    host                 : process.env.PG_HOST,            
    port                 : process.env.PG_PORT,          
    database             : process.env.PG_DATABASE,            
    username             : process.env.PG_USERNAME,           
    password             : process.env.PG_PASSWORD,           
    ssl: {
      rejectUnauthorized: false, 
  },
  })

 


  module.exports = sql;