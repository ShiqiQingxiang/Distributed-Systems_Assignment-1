import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';

const dynamoDB = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.TABLE_NAME || '';

// 处理API事件的主函数
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // 根据HTTP方法和路径参数调用不同的处理函数
    switch (event.httpMethod) {
      case 'GET':
        // 将在后续阶段实现
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ message: '获取电影功能将在后续实现' })
        };
      case 'POST':
        // 将在后续阶段实现
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ message: '添加电影功能将在后续实现' })
        };
      default:
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ message: `不支持的方法: ${event.httpMethod}` })
        };
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ message: '处理请求时发生错误' })
    };
  }
}; 