using { com.o2c as db } from '../db/schema';

service O2CService @(path:'/odata/v4/o2c') {

    entity Customers as projection on db.Customers;

    entity Orders as projection on db.Orders
        actions {
            action updateStatus(status: String) returns Orders;
        };

    entity OrderItems as projection on db.OrderItems;

    entity Invoices as projection on db.Invoices;
}
