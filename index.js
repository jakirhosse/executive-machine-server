const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

const SSLCommerzPayment = require('sslcommerz-lts');
const storeId =process.env.SS_COMMERCE_ID;
const storePassword =process.env.SS_COMMERCE_PASS ;
const is_live = false;

// Middleware
app.use(cors());
app.use(express.json());

// JWT verification middleware
const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorized' });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.DB_JWT_TOKEN, (error, decoded) => {
    if (error) {
      return res.status(403).send({ error: true, message: 'Forbidden' });
    }
    req.decoded = decoded;
    next();
  });
};

// MongoDB connection URI
const uri = `mongodb+srv://${process.env.PASS_NAME}:${process.env.DB_PASS}@mern.atgqzad.mongodb.net`;

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
  },
});

// Main function to run the server
async function run() {
  try {
    // Connect to the MongoDB cluster
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB successfully!");

    // Collections
    const productCollection = client.db('executiveMachines').collection('products');
    const bookingCollection = client.db('executiveMachines').collection('booking');
    const paymentCollection = client.db('executiveMachines').collection('payment');
    const usersCollection = client.db('executiveMachines').collection('users');
    const reviewCollection = client.db('executiveMachines').collection('review');

    // Routes

    // JWT Token generation
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.DB_JWT_TOKEN, { expiresIn: "3d" });
      res.send({ token });
    });

    // Products
    app.get('/products', async (req, res) => {
      const result = await productCollection.find({}).toArray();
      res.send(result);
    });

    // Users
    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get('/manageUser', verifyJwt, async (req, res) => {
      const result = await usersCollection.find({}).toArray();
      res.send(result);
    });

    app.patch('/users/:id', verifyJwt, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { role: 'admin' } };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send('Invalid ID format');
      }
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/users/admin/:email', verifyJwt, async (req, res) => {
      try {
          const email = req.params.email;
          const result = await usersCollection.findOne({ email });
          if(result) {
              res.send({ role: result.role });
          } else {
              res.status(404).send({ message: "User not found" });
          }
      } catch (error) {
          res.status(500).send({ message: "Internal Server Error" });
      }
  });
  

    // Bookings
    app.get('/reservation/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send('Invalid ID format');
      }
      const query = { _id: new ObjectId(id) };
      try {
        const result = await productCollection.findOne(query);
        if (!result) {
          return res.status(404).send('Reservation not found');
        }
        res.send(result);
      } catch (error) {
        console.error('Error fetching reservation:', error);
        res.status(500).send('Internal Server Error');
      }
    });

    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    app.delete('/booking/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send('Invalid ID format');
      }
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/booking/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send('Invalid ID format');
      }
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });

    app.get('/bookings/user', verifyJwt, async (req, res) => {
      const email = req.query.email;
      console.log(email);
      if (!email) {
        return res.send([]);
      }
      console.log("Request Email:", email);
      console.log("Decoded Email:", req.decoded.email);
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(401).send({ error: true, message: 'Unauthorized' });
      }
      const query = { email };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });
    

    app.patch('/booking/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send('Invalid ID format');
      }
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { payment: 'complete' } };
      const result = await bookingCollection.updateOne(query, updateDoc);
      res.send(result);
    });


    // payment getway ///  
    app.post('/bookings', async (req, res) => {
      try {
          const bookings = req.body;
          const requiredFields = ['totalPrice', 'currency', 'firstName', 'email', 'country', 'city', 'thana', 'postCode', 'number'];
          for (let field of requiredFields) {
              if (!bookings[field]) {
                  return res.status(400).send({ error: `${field} is required` });
              }
          }
  
          const transitionId = new ObjectId().toString();
  
          const data = {
              total_amount: bookings.totalPrice,
              currency: bookings.currency,
              tran_id: transitionId,
              success_url: `http://localhost:5000/payment/success?transitionId=${transitionId}`,
              fail_url: `http://localhost:5000/payment/fail?transitionId=${transitionId}`,
              cancel_url: `http://localhost:5000/payment/fail?transitionId=${transitionId}`,
              ipn_url: `http://localhost:5000/payment/fail?transitionId=${transitionId}`,
              shipping_method: 'Courier',
              product_name: 'Computer',
              product_category: 'Electronic',
              product_profile: 'general',
              cus_name: bookings.firstName,
              cus_email: bookings.email,
              cus_add1: bookings.country,
              cus_add2: bookings.country,
              cus_city: bookings.city,
              cus_state: bookings.thana,
              cus_postcode: bookings.postCode,
              cus_country: bookings.country,
              cus_phone: bookings.number,
              cus_fax: '01711111111',
              ship_name: bookings.firstName,
              ship_add1: bookings.country,
              ship_add2: bookings.country,
              ship_city: bookings.city,
              ship_state: bookings.thana,
              ship_postcode: bookings.postCode,
              ship_country: bookings.country,
          };
  
          const sslcz = new SSLCommerzPayment(storeId, storePassword, is_live);
  
          const apiResponse = await sslcz.init(data);
  
          if (apiResponse && apiResponse.GatewayPageURL) {
              await bookingCollection.insertOne({
                  ...bookings,
                  status: false,
                  transitionId: transitionId
              });
  
              res.send({ url: apiResponse.GatewayPageURL });
          } else {
              res.status(500).send({ error: 'Failed to initialize payment' });
          }
      } catch (error) {
          console.error(error);
          res.status(500).send({ error: 'An error occurred while processing your request' });
      }
  });

  // payment success ////
  app.post('/payment/success', async (req, res) => {
    const { transitionId } = req.query;
    if (!transitionId) {
        return res.redirect('http://localhost:5000/payment/fail');
    }
    const options = { upsert: true };
    const updateDoc = {
        $set: {
            status: true,
        },
    };
    const result = await bookingCollection.updateOne({ transitionId }, updateDoc, options);
    if (result.modifiedCount > 0) {
        res.redirect(`http://localhost:5000/payment/success?transitionId=${transitionId}`);
    }
  });
  

  //  payment failll ///
  
  app.post('/payment/fail', async (req, res) => {
    const { transitionId } = req.query;
    const result = await bookingCollection.deleteOne({ transitionId });
    if (result.deletedCount) {
        res.redirect('http://localhost:5000/payment/fail');
    }
});
  


    // Reviews
    app.post('/review', async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });

    app.get('/review', async (req, res) => {
      const result = await reviewCollection.find({}).toArray();
      res.send(result);
    });

    app.get('/review/user/:email', verifyJwt, async (req, res) => {
      const email = req.params.email;
      const result = await reviewCollection.find({ email }).toArray();
      res.send(result);
    });

  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
  }
}

// Run the server
run().catch(console.error);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});




