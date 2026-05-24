const { MongoClient } = require('mongodb');
const readline = require('readline');
require('dotenv').config();

//Configurações de conexão apontando para a variável de ambiente 
const mongoUri = process.env.MONGO_URI;

const perguntar = (interrogacao) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(interrogacao, resposta => {
        rl.close();
        resolve(resposta.trim());
    }));
};

function rodarRelatorios() {
    const mongoClient = new MongoClient(mongoUri);
    mongoClient.connect().then(function() {
        const db = mongoClient.db("company");
        const collection = db.collection('employees');
        console.log("Conectado ao MongoDB Atlas!\n");
        exibirMenu(collection, mongoClient);
    }).catch(function(error) {
        console.error("Erro ao conectar ao MongoDB:", error);
    });
}

function exibirMenu(collection, mongoClient) {
    console.log("==================================================");
    console.log("                  RELATÓRIOS                      ");
    console.log("==================================================");
    console.log("a) Employees por Manager (Nome/ID)");
    console.log("b) Employees por Title (Cargo)");
    console.log("c) Employees por Nome de Departamento");
    console.log("d) Média Salarial por Departamento");
    console.log("e) Sair");
    console.log("==================================================");
    perguntar("Escolha uma opção: ").then(function(opcao) {
        console.log("==================================================");
        switch (opcao.toLowerCase()) {
            case 'a':
                perguntar("Digite o ID (número) ou o nome do Manager: ").then(function(busca) {
                    relatorioA(collection, busca).then(function() { voltarMenu(collection, mongoClient); });
                });
                break;
            case 'b':
                collection.distinct("titles.title").then(function(cargosDisponiveis) {
                    console.log("\nCARGOS DISPONÍVEIS NO SISTEMA:");
                    cargosDisponiveis.forEach(function(titulo) {
                        console.log(`- ${titulo}`);
                    });
                    console.log("\n");
                    perguntar("Digite o cargo: ").then(function(cargo) {
                        relatorioB(collection, cargo).then(function() { voltarMenu(collection, mongoClient); });
                    });

                }).catch(function(err) {
                    console.error("Erro ao carregar a lista de cargos:", err);
                    voltarMenu(collection, mongoClient);
                });
                break;
            case 'c':
                collection.distinct("departments.dept_name").then(function(deptosDisponiveis) {
                    console.log("\nDEPARTAMENTOS DISPONÍVEIS NO SISTEMA:");
                    deptosDisponiveis.forEach(function(depto) {
                        console.log(`- ${depto}`);
                    });
                    console.log("\n");
                    perguntar("Digite o departamento: ").then(function(depto) {
                        relatorioC(collection, depto).then(function() { voltarMenu(collection, mongoClient); });
                    });
                }).catch(function(err) {
                    console.error("Erro ao carregar a lista de departamentos:", err);
                    voltarMenu(collection, mongoClient);
                });
                break;
            case 'd':
                relatorioD(collection).then(function() { voltarMenu(collection, mongoClient); });
                break;
            case 'e':
                console.log("\nSaindo...");
                mongoClient.close();
                console.log("Conexão com o MongoDB encerrada.");
                break;
            default:
                console.log("\nOpção inválida! Tente novamente.");
                voltarMenu(collection, mongoClient);
                break;
        }
    });
}

function voltarMenu(collection, mongoClient) {
    perguntar("Pressione ENTER para voltar.").then(function() {
        console.log("\n");
        exibirMenu(collection, mongoClient);
    });
}

function relatorioA(collection, busca) {
    return new Promise((resolve) => {
        console.log("\nRelatório Employees por Manager");
        let filtroManager = {};
        if (/^\d+$/.test(busca)) {
            filtroManager = { _id: parseInt(busca, 10) };
        } else {
            filtroManager = { 
                first_name: new RegExp(`^${busca}$`, 'i'),
                "manager_info.0": { $exists: true } 
            };
        }

        collection.findOne(filtroManager).then(function(manager) {
            if (!manager) {
                console.log(`Nenhum funcionário encontrado com a busca: "${busca}".`);
                return resolve();
            }

            const nomeManager = `${manager.first_name} ${manager.last_name}`;
            if (manager.manager_info && manager.manager_info.length > 0) {
                const deptNo = manager.manager_info[0].dept_no;
                collection.find({ "departments.dept_no": deptNo }).limit(10).toArray().then(function(result) {
                    console.log(`Manager Encontrado: ${nomeManager} (ID: ${manager._id})`);
                    console.log(`Funcionários:`);
                    console.table(result.map(e => ({ ID: e._id, Nome: `${e.first_name} ${e.last_name}`, Gênero: e.gender })));
                    console.log("\n");
                    resolve();
                });
            } else {
                console.log(`O funcionário "${nomeManager}" (ID: ${manager._id}) foi encontrado, mas ele não é gerente.`);
                console.log("\n");
                resolve();
            }
        }).catch(function(err) {
            console.error("Erro na busca do Relatório A:", err);
            resolve();
        });
    });
}

function relatorioB(collection, cargo) {
    return new Promise((resolve) => {
        console.log("\nEmployees por Title");
        collection.find({ "titles.title": cargo }).limit(10).toArray().then(function(result) {
            if (result.length > 0) {
                console.log(`Funcionários vinculados ao cargo "${cargo}":`);
                console.table(result.map(e => ({ ID: e._id, Nome: `${e.first_name} ${e.last_name}`, Contratação: e.hire_date })));
            } else {
                console.log(`Nenhum funcionário encontrado para "${cargo}".`);
            }
            console.log("\n");
            resolve();
        });
    });
}

function relatorioC(collection, deptoNome) {
    return new Promise((resolve) => {
        console.log("\nRelatório Employees por Nome de Departamento");
        collection.find({ "departments.dept_name": deptoNome }).limit(10).toArray().then(function(result) {
            if (result.length > 0) {
                console.log(`Funcionários vinculados ao departamento "${deptoNome}":`);
                console.table(result.map(e => ({ ID: e._id, Nome: `${e.first_name} ${e.last_name}` })));
            } else {
                console.log(`Nenhum funcionário encontrado para "${deptoNome}".`);
            }
            console.log("\n");
            resolve();
        });
    });
}

function relatorioD(collection) {
    return new Promise((resolve) => {
        console.log("\nRelatório média salarial por Departamento");
        collection.find({}).toArray().then(function(employees) {
            const deptoStats = {};
            employees.forEach(emp => {
                if (emp.departments && emp.salaries) {
                    emp.departments.forEach(depto => {
                        const deptoName = depto.dept_name;
                        if (!deptoStats[deptoName]) {
                            deptoStats[deptoName] = { soma: 0, count: 0 };
                        }
                        emp.salaries.forEach(sal => {
                            deptoStats[deptoName].soma += sal.salary;
                            deptoStats[deptoName].count += 1;
                        });
                    });
                }
            });

            const result = [];
            for (const [dept, stats] of Object.entries(deptoStats)) {
                if (stats.count > 0) {
                    result.push({
                        Departamento: dept,
                        mediaSalarial: stats.soma / stats.count
                    });
                }
            }

            result.sort((a, b) => b.mediaSalarial - a.mediaSalarial);
            console.table(result.map(m => ({ 
                Departamento: m.Departamento, 
                "Média Salarial": `R$ ${m.mediaSalarial.toFixed(2)}` 
            })));
            console.log("\n");
            resolve();
        }).catch(function(err) {
            console.error("Erro ao gerar Relatório D:", err);
            resolve();
        });
    });
}

rodarRelatorios();