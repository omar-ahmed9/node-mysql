/* jshint esversion: 6 */


const mysql2 = require('mysql2/promise');
let instances = {};

function DB() {
  this.pool = null;
}

/**
 * We are ovveriding the select method so that it returns the rows not the metadata
 * that is included in results[1]
 * @return {Object} Connection
 */
DB.prototype.getConnection = function () {
  return this.pool.getConnection().then((conn)=> {
    console.log('getting connection');
    let exec = conn.execute;
    conn.select = function(query, params) {
      return exec.call(this, query, params).then((results) => {
        return results[0];
      });
    };
    return conn;
  });
};

/**
 * Setup the Database connection pool for this instance
 * @param  {Object} config
 */
DB.prototype.configure = function (config) {
  this.pool = mysql2.createPool(config);
};

/**
 * Run DB query, it uses prepared statements
 * @param  {String} query
 * @param  {Object} [params]
 * @return {Promise}
 */
DB.prototype.query = function (query, params) {
  let connection;

  return this.getConnection().then((conn)=> {
    console.log('getting connection');
    connection = conn;
    return connection.execute(query, params);
  }).then((results) => {
    if (connection && connection.connection) {
      connection.connection.unprepare(query);
      connection.release();
      console.log('ok - released connection');
    }

    return results[0];
  }).catch(err => {
    if (!connection) {
      console.error('could not establish db connection', err.message);
      throw err;
    }
    if (connection.connection) {
      connection.connection.unprepare(query);
    }

    connection.release();
    console.error(`released connection, even with error in sql query execution. Error Message : ${err.message} - `, query, params);

    throw err;
  });
};

/**
* Set Session wait timeout parameter to close connection if inactive
* Initiate transaction so all the subsequent queries to the db are not written
* to the database until commit is called
* @param  {String} timeout
*
* @return {object} connection
**/
DB.prototype.startTransaction = function (timeout) {
  timeout = timeout || 20;
  let connection;
  return this.getConnection().then(conn => {
    connection = conn;
    return connection.query('SET SESSION wait_timeout = ?', [timeout]);
  }).then(()=> {
    return connection.query('START TRANSACTION');
  }).then(() => {
    return connection;
  });
};

/**
 * Rollback the current transaction
 * @param  {Object} connection The connection object from startTransaction
 */
DB.prototype.rollback = function (connection) {
  return connection.execute('ROLLBACK').then(()=> {
    connection.release();
  }).catch(err => {
    connection.release();

    throw err;
  });
};

/**
 * Commit the current transaction 
 * @param  {Object} connection The connection object from startTransaction
 */
DB.prototype.commit = function (connection) {
  return connection.execute('COMMIT').then(()=> {
    connection.release();
  }).catch(err => {
    connection.release();

    throw err;
  });
};

module.exports = function (opts) {
  if (!opts || Object.keys(opts).length <= 0) {
    throw new Error('The config object cannot be empty');
  }

  name = '_default_';

  if (opts.name) {
    name = opts.name;
    delete opts.name;
  }

  if (!instances[name]) {
    let instance = new DB();
    instance.configure(opts);
    instances[name] = instance;
  }

  return instances[name];
};
