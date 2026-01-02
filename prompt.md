

I want to build a delivery optimizer for a delivery company. The optimizer should be able to optimize the delivery routes for a delivery company. The optimizer should be able to optimize the delivery routes for a delivery company.

I will have order in database and I want to optimize the delivery routes for these orders.

I want to use python to build this optimizer.

Also, planning the routes daily it will be inputed to a dielvery backend system with mobile app for drivers. The driver will follow the routes and deliver the orders with featback loop to the backend system. The delivery times, delays, status will be reflected to the db. Sometimes the orders will be changed or canceled, or customer is not around/door locked.

A Data model will take this data and used to derive parameters all the drivers can take maximum how many jobs per day. These parameters will be inputed to the optimizer to optimize the delivery routes.

The data model will be be run daily before inputedt ot the optimizer which will run.

We will used postgres for databases for data-model, optimizer and mobile app.