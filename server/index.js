// require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const pool = require('./db');

const corsOptions = {
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    optionSuccessStatus: 200
}

app.use(cors(corsOptions));
app.use(express.json());

const setFeaturedArticlesInterval = async () => {
    try {
        const featured_categories_ids = [18, 2, 42, 31, 6, 15, 50, 8, 13, 63, 9, 35, 19];

        const featured = await pool.query("SELECT featured_document_id FROM featured_articles;");

        const docIds = await pool.query(
            `SELECT document_id 
            FROM documents 
            WHERE disease_area_and_topic_id 
            NOT IN (${featured_categories_ids.join(",")})`);

        if (featured.rowCount === 0) {
            const newFeatured = docIds.rows.map(row => row.document_id).sort((a, b) => 0.5 - Math.random()).slice(0, 10);

            for (const id of newFeatured) {
                await pool.query("INSERT INTO featured_articles (featured_document_id, time_set) VALUES ($1, NOW());", [id])
            }
        }

        if (featured.rowCount > 0) {
            const filterPreviousFeatured = docIds.rows.map(row => row.document_id).filter(id => !featured.rows.map(row => row.featured_document_id).includes(id));
            const newFeatured = filterPreviousFeatured.sort((a, b) => 0.5 - Math.random()).slice(0, 10);

            for (const id of newFeatured) {
                await pool.query("INSERT INTO featured_articles (featured_document_id, time_set) VALUES ($1, NOW());", [id])
            }
        }

        if ((docIds.rowCount - featured.rowCount) <= 10) {
            await pool.query('DELETE FROM featured_articles');

            const newFeatured = docIds.rows.map(row => row.document_id).sort((a, b) => 0.5 - Math.random()).slice(0, 10);

            for (const id of newFeatured) {
                await pool.query("INSERT INTO featured_articles (featured_document_id, time_set) VALUES ($1, NOW());", [id])
            }
        }
    } catch (error) {
        console.log(error.message);
    }
}

const setFeaturedCategoriesInterval = async () => {
    try {
        const SELECT_FEATURED_CATEGORIES_QUERY = `
            SELECT * FROM featured_categories 
            WHERE has_featured = FALSE
            ORDER BY featured_categories_id ASC;
            `;
        const UPDATE = 'UPDATE featured_categories SET has_featured = TRUE WHERE featured_categories_id = $1';
        
        const featuredCategories = await pool.query(SELECT_FEATURED_CATEGORIES_QUERY);

        if(featuredCategories.rowCount > 0){
            console.log(featuredCategories.rows[0].featured_categories_id)
            await pool.query(UPDATE, [featuredCategories.rows[0].featured_categories_id]);
        }

        if (featuredCategories.rowCount === 0) {
            await pool.query('UPDATE featured_categories SET has_featured = FALSE WHERE featured_categories_id > 1;')
            const newCycle = await pool.query(SELECT_FEATURED_CATEGORIES_QUERY);
            await pool.query(UPDATE, [newCycle.rows[0].featured_categories_id]);
        }
    } catch (error) {
        console.log(error.message);
    }
}

const intervalTime = 1000 * 60 * 60 * 24 * 7;//1000 * 60 * 60 * 24;
setInterval(setFeaturedArticlesInterval, intervalTime);
setInterval(setFeaturedCategoriesInterval, intervalTime );

const SELECT_DOCS_QUERY = `
    SELECT 
        document_id, 
        name_of_document, 
        disease_specific, 
        document_link, 
        publisher_owner, 
        synopsis,
        page_views,
        languages.document_language, 
        disease_area_and_topic.disease_area_and_topic, 
        document_type.document_type
    FROM documents 
    LEFT JOIN languages ON documents.languages_id = languages.languages_id
    LEFT JOIN disease_area_and_topic ON documents.disease_area_and_topic_id = disease_area_and_topic.disease_area_and_topic_id
    LEFT JOIN document_type ON documents.document_type_id = document_type.document_type_id`

app.get('/documents', async (req, res) => {
    try {
        const names = await pool.query(SELECT_DOCS_QUERY);

        res.json(names.rows);
    } catch (err) {
        console.log(err.message);
    }
})

app.get('/documents/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const document = await pool.query(`${SELECT_DOCS_QUERY} WHERE document_id = $1`, [id]);

        res.json(document.rows[0]);
    } catch (err) {
        console.log(err.message);
    }
})

app.get('/get-documents-by-disease-type/:disease_type', async (req, res) => {
    try {
        const { disease_type } = req.params;

        const documents = await pool.query(`${SELECT_DOCS_QUERY} WHERE disease_area_and_topic = $1;`, [disease_type])

        res.json(documents.rows)
    } catch (error) {
        console.log(error.message);
    }
})

app.get('/resource-pages/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const resourcePages = await pool.query("SELECT resource FROM resource_pages WHERE document_id = $1", [id]);

        res.json(resourcePages.rows);
    } catch (err) {
        console.log(err.message);
    }
})

app.get('/documents-names', async (req, res) => {
    try {
        const names = await pool.query(`SELECT document_id, name_of_document FROM documents`);

        res.json(names.rows);
    } catch (err) {
        console.log(err.message);
    }
})

app.get('/get-most-read-articles', async (req, res) => {
    try {
        const mostRead = await pool.query(`${SELECT_DOCS_QUERY} WHERE page_views IS NOT NULL ORDER BY page_views DESC LIMIT 10;`);

        res.json(mostRead.rows);
    } catch (err) {
        console.log(err.message, 'MOST READ');
    }
})

app.get('/get-featured-articles', async (req, res) => {
    try {
        const featured = await pool.query("SELECT * FROM featured_articles ORDER BY id DESC LIMIT 10;");

        res.json(featured.rows)
    } catch (error) {
        console.log(error.message);
    }
})

app.get('/get-featured-category', async (req, res) => {
    try {
        const featured = await pool.query('SELECT * FROM featured_categories WHERE has_featured = TRUE ORDER BY featured_categories_id DESC LIMIT 1;');
        
        res.json(featured.rows[0]);
    } catch (error) {
        console.log(error.message);
    }
})

app.post('/record-page-view/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const query = await pool.query("SELECT page_views FROM documents WHERE document_id = $1", [id]);

        const increment = query.rows[0].page_views === null ? 1 : ++query.rows[0].page_views;

        await pool.query("UPDATE documents SET page_views = $1 WHERE document_id = $2;", [increment, id]);

        res.end();
    } catch (err) {
        console.log(err.message);
    }
})

app.listen(process.env.SERVER_PORT, () => {
    console.log(`server has started on port ${process.env.SERVER_PORT}`);
})