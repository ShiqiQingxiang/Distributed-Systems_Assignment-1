import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const dynamoDB = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME || '';

// 定义电影类型
interface Movie {
  category: string;
  id: string;
  title: string;
  director: string;
  year: number;
  rating: number;
  description: string;
  isAvailable: boolean;
}

// 处理添加新电影的POST请求
const addMovie = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const requestBody = JSON.parse(event.body || '{}');
    
    // 验证必填字段
    if (!requestBody.title || !requestBody.category || !requestBody.description) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: '标题、类别和描述是必填字段' })
      };
    }

    const movieId = uuidv4();
    const movie: Movie = {
      id: movieId,
      category: requestBody.category,
      title: requestBody.title,
      director: requestBody.director || 'Unknown',
      year: requestBody.year || new Date().getFullYear(),
      rating: requestBody.rating || 0,
      description: requestBody.description,
      isAvailable: requestBody.isAvailable !== undefined ? requestBody.isAvailable : true
    };

    // 保存到DynamoDB
    await dynamoDB.put({
      TableName: TABLE_NAME,
      Item: movie
    }).promise();

    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ message: '电影添加成功', movieId, movie })
    };
  } catch (error) {
    console.error('添加电影时出错:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: '处理请求时发生错误' })
    };
  }
};

// 处理获取电影列表的GET请求
const getMoviesByCategory = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const category = event.queryStringParameters?.category;

    if (!category) {
      // 如果没有提供类别，返回所有电影(注意：这在生产环境可能不是最佳实践)
      const result = await dynamoDB.scan({
        TableName: TABLE_NAME,
        Limit: 50 // 限制返回的数量
      }).promise();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ movies: result.Items })
      };
    }
    
    // 根据类别查询电影
    const result = await dynamoDB.query({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'category = :category',
      ExpressionAttributeValues: {
        ':category': category
      }
    }).promise();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ movies: result.Items })
    };
  } catch (error) {
    console.error('获取电影时出错:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: '处理请求时发生错误' })
    };
  }
};

// CORS头
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
};

// 处理API事件的主函数
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // 处理CORS预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  try {
    // 根据HTTP方法和路径参数调用不同的处理函数
    switch (event.httpMethod) {
      case 'GET':
        return await getMoviesByCategory(event);
      case 'POST':
        return await addMovie(event);
      default:
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: `不支持的方法: ${event.httpMethod}` })
        };
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: '处理请求时发生错误' })
    };
  }
}; 