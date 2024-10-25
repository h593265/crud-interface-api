const express = require("express");
const cors = require("cors");
const sql = require('./db');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;



app.use(express.json());

const corsOptions = {
    origin: process.env.ORIGIN, 
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
};
console.log(corsOptions)

app.use(cors(corsOptions));

app.use((req, res, next) => {
    if (!req.secure) {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });

const allowedTables =  process.env.TABLE_WHITELIST



app.get('/gettabledata', async (req, res) => {
    const { resource, limit, offset, search, column } = req.query;

    

    if (!allowedTables.includes(resource)) {
        return res.status(400).json({ error: 'Invalid table name' });
    }

    const validLimit = limit ? parseInt(limit) : 10;
    const validOffset = offset ? parseInt(offset) : 0;

    try {
        let result;
        let totalRecords;


        const baseQuery = sql`FROM ${sql(resource)}`;


        if (search && column) {

            const columnType = await sql`
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name = ${resource} 
                AND column_name = ${column}
            `;




            if (columnType.length > 0) {
                const columnDataType = columnType[0].data_type;


                let condition;
                if (columnDataType === 'character varying' || columnDataType === 'text') {

                    condition = sql`${sql(column)} ILIKE ${search + '%'}`;
                } else if (columnDataType === 'integer') {
                    const searchValue = parseInt(search);
                    if (isNaN(searchValue)) {
                        return res.status(400).json({ error: 'Invalid search term for numeric column' });
                    }

                    condition = sql`${sql(column)} = ${searchValue}`;
                } else {
                    return res.status(400).json({ error: 'Unsupported column data type for search' });
                }


                totalRecords = await sql`
                    SELECT COUNT(*) ${baseQuery} WHERE ${condition}
                `;


                result = await sql`
                    SELECT * ${baseQuery} WHERE ${condition} LIMIT ${validLimit} OFFSET ${validOffset}
                `;
            } else {
                return res.status(400).json({ error: 'Invalid column name' });
            }
        } else {

            totalRecords = await sql`
                SELECT COUNT(*) ${baseQuery}
            `;

            result = await sql`
                SELECT * ${baseQuery}
                LIMIT ${validLimit} OFFSET ${validOffset}
            `;
        }


        res.status(200).json({ data: result, totalRecords: totalRecords[0].count });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.post('/addrecord', async (req, res) => {
    const { resource, data, columndata } = req.body;

    


    if (!allowedTables.includes(resource)) {
        return res.status(400).json({ error: 'Invalid table name' });
    }

    try {

        const columns = columndata.map(col => col.column_name);


        const [insertedRecord] = await sql`
        INSERT INTO ${sql(resource)} ${sql(data, columns)
            }
        RETURNING *;
      `;

        res.status(201).json({ message: 'Record added successfully', record: insertedRecord });
    } catch (error) {
        console.error('Error adding record:', error.message);


        if (error.code === '23505') {
            return res.status(409).json({ error: 'Record with the same unique field already exists.' });
        }

        res.status(500).json({ error: 'Internal Server Error' });
    }
});





app.get('/gettablecolumns', async (req, res) => {
    const { resource } = req.query;
    

    if (!allowedTables.includes(resource)) {
        return res.status(400).json({ error: 'Invalid table name' });
    }

    try {
        const columns = await sql`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = ${resource}
      `;

        res.status(200).json({ columns });
    } catch (error) {
        console.error('Error fetching columns:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/getrelateddata', async (req, res) => {
    const { table, id } = req.query;
  
    try {
      
      const referencingTables = await sql`
        SELECT 
          kcu.table_name AS referencing_table,
          kcu.column_name AS referencing_column,
          ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column
        FROM 
          information_schema.table_constraints AS tc
        JOIN 
          information_schema.key_column_usage AS kcu 
          ON tc.constraint_name = kcu.constraint_name
        JOIN 
          information_schema.constraint_column_usage AS ccu 
          ON ccu.constraint_name = tc.constraint_name
        WHERE 
          tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = ${table}
      `;
  
      
      const childDataPromises = referencingTables.map(async ref => {
        return await sql`
          SELECT * FROM ${sql([ref.referencing_table])} WHERE ${sql([ref.referencing_column])} = ${id}
        `;
      });
      const childDataResults = await Promise.all(childDataPromises);
  
      
      const referencedTables = await sql`
        SELECT 
          kcu.table_name AS referencing_table,
          kcu.column_name AS referencing_column,
          ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column
        FROM 
          information_schema.table_constraints AS tc
        JOIN 
          information_schema.key_column_usage AS kcu 
          ON tc.constraint_name = kcu.constraint_name
        JOIN 
          information_schema.constraint_column_usage AS ccu 
          ON ccu.constraint_name = tc.constraint_name
        WHERE 
          tc.constraint_type = 'FOREIGN KEY'
          AND kcu.table_name = ${table}
      `;
  
      
      const parentDataPromises = referencedTables.map(async ref => {
        return await sql`
          SELECT * FROM ${sql([ref.referenced_table])} WHERE ${sql([ref.referenced_column])} = ${id}
        `;
      });
      const parentDataResults = await Promise.all(parentDataPromises);
  
     
    
     
      
      res.json({ parentDataResults, childDataResults });
    } catch (error) {
      console.error('Error fetching associated data:', error);
      res.status(500).json({ error: 'Failed to fetch associated data' });
    }
  });
  
  
  






app.delete('/deleteRecord', async (req, res) => {
    const { resource, id } = req.query;
    

    if (!allowedTables.includes(resource)) {
        return res.status(400).json({ error: 'Invalid table name' });
    }

    if (!id) {
        return res.status(400).json({ error: 'Record ID is required' });
    }

    try {

        const result = await sql`
            DELETE FROM ${sql(resource)} WHERE ${sql(resource + 'id')} = ${id} RETURNING *;
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        res.json({ message: 'Record deleted successfully', deletedRecord: result[0] });
    } catch (error) {
        console.error('Error deleting record:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.put('/editRecord', async (req, res) => {
    const { resource, id } = req.query;
    const { data } = req.body

   
    const allowedTables = ['orders', 'selskap', 'orderlines'];

    if (!allowedTables.includes(resource)) {
        
        return res.status(400).json({ error: 'Invalid table name' });
    }


    try {



        await sql`
        UPDATE ${sql(resource)} SET ${sql(data)} WHERE ${sql(resource + 'id')} = ${id}
      `;

        res.status(200).json({ message: 'Record updated successfully' });
    } catch (error) {

        console.error('Error updating record:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});





















app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});