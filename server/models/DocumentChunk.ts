import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

export class DocumentChunk extends Model {
  declare id: number;
  declare content: string;
  declare embedding: string;
}

DocumentChunk.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    embedding: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'document_chunks',
    timestamps: false,
  },
);

export default DocumentChunk;
