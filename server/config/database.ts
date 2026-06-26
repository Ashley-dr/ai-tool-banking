import { Sequelize } from 'sequelize';

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  database: process.env.DB_NAME ?? 'banking_ai',
  username: process.env.DB_USER ?? 'bank_admin',
  password: process.env.DB_PASSWORD ?? 'SecretBankPassword2026',
  logging: false,
});

export default sequelize;
