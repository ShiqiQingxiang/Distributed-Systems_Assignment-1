import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB, Translate } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const dynamoDB = new DynamoDB.DocumentClient();
const translate = new Translate();
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
  translations?: { [key: string]: string }; // 添加翻译字段
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
      isAvailable: requestBody.isAvailable !== undefined ? requestBody.isAvailable : true,
      translations: {} // 初始化空的翻译对象
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

// 处理更新电影的PUT请求
const updateMovie = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const category = event.pathParameters?.category;
    const id = event.pathParameters?.id;
    
    if (!category || !id) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: '缺少类别或ID参数' })
      };
    }
    
    const requestBody = JSON.parse(event.body || '{}');
    
    // 检查电影是否存在
    const existingMovie = await dynamoDB.get({
      TableName: TABLE_NAME,
      Key: {
        category,
        id
      }
    }).promise();
    
    if (!existingMovie.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: '电影不存在' })
      };
    }
    
    // 准备更新表达式
    let updateExpression = 'SET ';
    const expressionAttributeValues: { [key: string]: any } = {};
    const expressionAttributeNames: { [key: string]: string } = {};
    
    // 映射要更新的字段
    const updatableFields = [
      { key: 'title', name: '#title' },
      { key: 'director', name: '#director' },
      { key: 'year', name: '#year' },
      { key: 'rating', name: '#rating' },
      { key: 'description', name: '#description' },
      { key: 'isAvailable', name: '#isAvailable' }
    ];
    
    let hasUpdates = false;
    
    for (const field of updatableFields) {
      if (requestBody[field.key] !== undefined) {
        hasUpdates = true;
        updateExpression += `${field.name} = :${field.key}, `;
        expressionAttributeValues[`:${field.key}`] = requestBody[field.key];
        expressionAttributeNames[field.name] = field.key;
      }
    }
    
    if (!hasUpdates) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: '没有提供要更新的字段' })
      };
    }
    
    // 移除最后的逗号和空格
    updateExpression = updateExpression.slice(0, -2);
    
    // 更新DynamoDB中的电影
    await dynamoDB.update({
      TableName: TABLE_NAME,
      Key: {
        category,
        id
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW'
    }).promise();
    
    // 获取更新后的电影
    const updatedMovie = await dynamoDB.get({
      TableName: TABLE_NAME,
      Key: {
        category,
        id
      }
    }).promise();
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        message: '电影更新成功', 
        movie: updatedMovie.Item 
      })
    };
  } catch (error) {
    console.error('更新电影时出错:', error);
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
    // 添加额外的筛选条件
    const yearFilter = event.queryStringParameters?.year;
    const directorFilter = event.queryStringParameters?.director;
    const isAvailableFilter = event.queryStringParameters?.isAvailable;
    
    let filterExpression = '';
    const expressionAttributeValues: { [key: string]: any } = {};
    
    // 构建过滤表达式
    if (yearFilter) {
      filterExpression += filterExpression ? ' AND ' : '';
      filterExpression += '#year = :year';
      expressionAttributeValues[':year'] = parseInt(yearFilter);
    }
    
    if (directorFilter) {
      filterExpression += filterExpression ? ' AND ' : '';
      filterExpression += 'contains(#director, :director)';
      expressionAttributeValues[':director'] = directorFilter;
    }
    
    if (isAvailableFilter !== undefined) {
      filterExpression += filterExpression ? ' AND ' : '';
      filterExpression += '#isAvailable = :isAvailable';
      expressionAttributeValues[':isAvailable'] = isAvailableFilter === 'true';
    }
    
    const expressionAttributeNames: { [key: string]: string } = {
      '#year': 'year',
      '#director': 'director',
      '#isAvailable': 'isAvailable'
    };

    if (!category) {
      // 如果没有提供类别，返回所有电影并应用过滤条件
      const params: DynamoDB.DocumentClient.ScanInput = {
        TableName: TABLE_NAME,
        Limit: 50
      };
      
      if (filterExpression) {
        params.FilterExpression = filterExpression;
        params.ExpressionAttributeValues = expressionAttributeValues;
        params.ExpressionAttributeNames = expressionAttributeNames;
      }
      
      const result = await dynamoDB.scan(params).promise();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ movies: result.Items })
      };
    }
    
    // 根据类别查询电影并应用过滤条件
    const params: DynamoDB.DocumentClient.QueryInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'category = :category',
      ExpressionAttributeValues: {
        ':category': category,
        ...expressionAttributeValues
      }
    };
    
    if (filterExpression) {
      params.FilterExpression = filterExpression;
      params.ExpressionAttributeNames = expressionAttributeNames;
    }
    
    const result = await dynamoDB.query(params).promise();

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

// 获取翻译后的电影描述
const getTranslatedMovie = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const category = event.pathParameters?.category;
    const id = event.pathParameters?.id;
    const language = event.queryStringParameters?.language || 'en'; // 默认翻译为英语
    
    if (!category || !id) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: '缺少类别或ID参数' })
      };
    }
    
    // 获取电影数据
    const result = await dynamoDB.get({
      TableName: TABLE_NAME,
      Key: {
        category,
        id
      }
    }).promise();
    
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: '电影不存在' })
      };
    }
    
    const movie = result.Item as Movie;
    
    // 检查是否已有该语言的翻译缓存
    if (movie.translations && movie.translations[language]) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          message: '使用缓存的翻译',
          movie: {
            ...movie,
            translated_description: movie.translations[language]
          }
        })
      };
    }
    
    // 调用Amazon Translate服务
    const translateParams = {
      Text: movie.description,
      SourceLanguageCode: 'auto', // 自动检测源语言
      TargetLanguageCode: language
    };
    
    const translationResult = await translate.translateText(translateParams).promise();
    const translatedText = translationResult.TranslatedText;
    
    // 更新电影记录，保存翻译结果
    if (!movie.translations) {
      movie.translations = {};
    }
    
    movie.translations[language] = translatedText;
    
    // 保存更新的电影记录
    await dynamoDB.put({
      TableName: TABLE_NAME,
      Item: movie
    }).promise();
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: '翻译成功',
        movie: {
          ...movie,
          translated_description: translatedText
        }
      })
    };
  } catch (error) {
    console.error('翻译电影描述时出错:', error);
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
    // 检查路径是否包含 /translation
    const path = event.path || '';
    const isTranslationRequest = path.includes('/translation');
    
    if (isTranslationRequest && event.httpMethod === 'GET') {
      return await getTranslatedMovie(event);
    }
    
    // 根据HTTP方法和路径参数调用不同的处理函数
    switch (event.httpMethod) {
      case 'GET':
        return await getMoviesByCategory(event);
      case 'POST':
        return await addMovie(event);
      case 'PUT':
        return await updateMovie(event);
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