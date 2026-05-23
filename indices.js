const { MongoClient } = require('mongodb');
const mongoUri = 'mongodb+srv://jvbbalhego_db_user:c3Zg94PQK2Ny3uUN@m2db2-cluster.7d0ysjj.mongodb.net/?appName=M2DB2-Cluster';
function criarIndices() {
    const mongoClient = new MongoClient(mongoUri);
    mongoClient.connect().then(function() {
        const db = mongoClient.db("company");
        const collection = db.collection('employees');
        console.log("Conectado ao MongoDB Atlas. Criando índices.\n");

        //relatório A
        collection.createIndex({ first_name: 1 }).then(function(resultadoA) {
            console.log(`Índice criado: ${resultadoA}`);
            //relatório B
            return collection.createIndex({ "titles.title": 1 });
        }).then(function(resultadoB) {
            console.log(`Índice criado: ${resultadoB}`);
            //relatório C
            return collection.createIndex({ "departments.dept_name": 1 });
        }).then(function(resultadoC) {
            console.log(`Índice criado: ${resultadoC}`);
            mongoClient.close();
        }).catch(function(err) {
            console.error("Erro durante a criação dos índices:", err);
            mongoClient.close();
        });
    }).catch(function(err) {
        console.error("Erro ao conectar ao banco de dados:", err);
    });
}

criarIndices();