const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');

//Configurações de conexão
const mysqlUri = 'mysql://root:Joao0610$@localhost:3306/employees';
const mongoUri = 'mongodb+srv://jvbbalhego_db_user:c3Zg94PQK2Ny3uUN@m2db2-cluster.7d0ysjj.mongodb.net/?appName=M2DB2-Cluster';

async function iniciarMigracao() {
    let mysqlConn;
    const mongoClient = new MongoClient(mongoUri);

    try {
        //Conecta em ambos os bancos de dados
        mysqlConn = await mysql.createConnection(mysqlUri);
        await mongoClient.connect();
        console.log("Conectado ao MySQL e ao MongoDB Atlas!\n");

        const db = mongoClient.db("company");
        const collection = db.collection('employees');

        //Busca no BD se já existe uma collection chamada 'emplooyes'
        const colecoesExistentes = await db.listCollections({name: 'employees'}).toArray();

        //Se o array retornar algum item (lenght > 0) a colllection existe e faz o drop da mesma para iniciar a migração novamente
        if(colecoesExistentes.length > 0){
            await collection.drop();
            console.log("Collection Employees que já existia no MongoDB foi deletada para começar uma nova migração.\n");
        } else {
            console.log("Collection 'Employees' ainda não existe, inciando migração.\n");
        }

        //Busca todos os funcionários do MySQL
        const [employees] = await mysqlConn.query('SELECT * FROM employees');
        console.log(`Encontrados ${employees.length} funcionários para migrar.\n`);

        const TAMANHO_LOTE = 5000;

        //Itera em lote(Bulking) sobre os funcionários para buscar os dados das outras tabelas
        for (let i = 0; i < employees.length; i += TAMANHO_LOTE) {
            
            //Separa o lote atual de funcionários
            const lote = employees.slice(i, i + TAMANHO_LOTE);
            
            //Extrai apenas os IDs para fazer uma busca única no MySQL
            const empIds = lote.map(emp => emp.emp_no);

            //Busca os dados de TODAS as tabelas relacionadas APENAS para os IDs deste lote.
            const [salaries] = await mysqlConn.query('SELECT emp_no, salary, from_date, to_date FROM salaries WHERE emp_no IN (?)', [empIds]);
            const [titles] = await mysqlConn.query('SELECT emp_no, title, from_date, to_date FROM titles WHERE emp_no IN (?)', [empIds]);
            const [departments] = await mysqlConn.query(
                `SELECT de.emp_no, d.dept_no, d.dept_name, de.from_date, de.to_date 
                 FROM dept_emp de 
                 JOIN departments d ON de.dept_no = d.dept_no 
                 WHERE de.emp_no IN (?)`, [empIds]
            );
            const [managers] = await mysqlConn.query('SELECT emp_no, dept_no FROM dept_manager WHERE emp_no IN (?)', [empIds]);

            //Organiza os dados em memória (Dicionário) para montarmos os documentos rápido.
            const dadosAgrupados = {};
            empIds.forEach(id => {
                dadosAgrupados[id] = { salaries: [], titles: [], departments: [], manager_info: [] };
            });

            //Distribui os dados retornados do MySQL para seus respectivos funcionários
            salaries.forEach(s => dadosAgrupados[s.emp_no].salaries.push({ salary: s.salary, from_date: s.from_date, to_date: s.to_date }));
            titles.forEach(t => dadosAgrupados[t.emp_no].titles.push({ title: t.title, from_date: t.from_date, to_date: t.to_date }));
            departments.forEach(d => dadosAgrupados[d.emp_no].departments.push({ dept_no: d.dept_no, dept_name: d.dept_name, from_date: d.from_date, to_date: d.to_date }));
            managers.forEach(m => dadosAgrupados[m.emp_no].manager_info.push({ dept_no: m.dept_no }));

            //Prepara o Array de operações BulkWrite para o MongoDB
            const bulkOps = lote.map(emp => ({
                updateOne: {
                    filter: { _id: emp.emp_no }, // Se achar esse ID...
                    update: { 
                        $set: {
                            birth_date: emp.birth_date,
                            first_name: emp.first_name,
                            last_name: emp.last_name,
                            gender: emp.gender,
                            hire_date: emp.hire_date,
                            salaries: dadosAgrupados[emp.emp_no].salaries,
                            titles: dadosAgrupados[emp.emp_no].titles,
                            departments: dadosAgrupados[emp.emp_no].departments,
                            manager_info: dadosAgrupados[emp.emp_no].manager_info
                        }
                    },
                    upsert: true //Se não achar, cria um novo (evita duplicação)
                }
            }));

            //Executa a gravação em massa no MongoDB (1 viagem na rede gravando 1000 documentos)
            await collection.bulkWrite(bulkOps);
            
            //Um log para acompanhar que o script não travou
            console.log(`Progresso: ${Math.min(i + TAMANHO_LOTE, employees.length)} / ${employees.length} funcionários migrados.`);
        }

        console.log("Migração concluída com sucesso!");

    } catch (error) {
        console.error("Erro durante a migração:", error);
    } finally {
        //Fecha as conexões de forma segura
        if (mysqlConn) await mysqlConn.end();
        await mongoClient.close();
        console.log("Conexões encerradas.");
    }
}

iniciarMigracao();