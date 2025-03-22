import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// 确保全局错误被捕获
process.on('unhandledRejection', (reason, promise) => {
  console.error('全局未处理的Promise拒绝:', reason);
});

// 配置重试机制
AWS.config.update({
  maxRetries: 3,
  retryDelayOptions: { base: 200 },
  region: process.env.AWS_REGION || 'eu-west-1' // 使用Lambda环境变量中的区域
});

// 初始化服务客户端
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const translate = new AWS.Translate({ apiVersion: '2017-07-01' });

// 获取DynamoDB表名
const TABLE_NAME = process.env.TABLE_NAME || '';
console.log('TABLE_NAME:', TABLE_NAME);

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
  translations?: { [key: string]: string };
}

// 备用电影数据
const sampleMovies: Movie[] = [
  {
    id: 'movie1',
    category: 'action',
    title: '黑客帝国',
    director: '沃卓斯基姐妹',
    year: 1999,
    rating: 8.7,
    description: '一个计算机黑客了解到现实世界的真相，并加入对抗机器人的反抗军。',
    isAvailable: true,
    translations: { 'en': 'A computer hacker learns about the true nature of reality and joins a rebellion against machines.' }
  },
  {
    id: 'movie2',
    category: 'drama',
    title: '肖申克的救赎',
    director: '弗兰克·德拉邦特',
    year: 1994,
    rating: 9.3,
    description: '两个被监禁的人在数十年的时间里建立了非凡的友谊，在绝望中找到了希望。',
    isAvailable: true,
    translations: { 'en': 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.' }
  }
];

// CORS头
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
};

// 向DynamoDB添加电影
async function addMovieToDB(movie: Movie): Promise<boolean> {
  if (!TABLE_NAME) {
    console.log('TABLE_NAME环境变量未设置');
    return false;
  }

  try {
    await dynamoDB.put({
      TableName: TABLE_NAME,
      Item: movie
    }).promise();
    console.log('成功添加电影到DynamoDB:', movie.id);
    return true;
  } catch (error) {
    console.error('添加电影到DynamoDB时出错:', error);
    return false;
  }
}

// 从DynamoDB获取电影
async function getMovieFromDB(category: string, id: string): Promise<Movie | null> {
  console.log('尝试从DynamoDB获取电影:', { category, id });
  
  if (!TABLE_NAME) {
    console.log('TABLE_NAME环境变量未设置，使用备用数据');
    const movie = sampleMovies.find(m => m.id === id && m.category === category);
    console.log('从备用数据中找到电影:', !!movie);
    return movie || null;
  }

  try {
    console.log('查询DynamoDB表:', TABLE_NAME);
    const result = await dynamoDB.get({
      TableName: TABLE_NAME,
      Key: { category, id }
    }).promise();
    
    if (result.Item) {
      console.log('从DynamoDB获取到电影:', id);
      return result.Item as Movie;
    }
    
    console.log('在DynamoDB中未找到电影，尝试备用数据');
    const movie = sampleMovies.find(m => m.id === id && m.category === category);
    console.log('从备用数据中找到电影:', !!movie);
    return movie || null;
  } catch (error) {
    console.error('从DynamoDB获取电影时出错，详细错误:', error);
    console.log('尝试从备用数据中查找');
    const movie = sampleMovies.find(m => m.id === id && m.category === category);
    console.log('从备用数据中找到电影:', !!movie);
    return movie || null;
  }
}

// 直接通过ID获取电影（新增函数）
async function getMovieByIdFromDB(id: string): Promise<Movie | null> {
  if (!TABLE_NAME) {
    console.log('TABLE_NAME环境变量未设置，使用备用数据');
    return sampleMovies.find(m => m.id === id) || null;
  }

  try {
    // 由于DynamoDB需要分区键和排序键，我们需要扫描表以查找特定ID
    const scanParams = {
      TableName: TABLE_NAME,
      FilterExpression: 'id = :idValue',
      ExpressionAttributeValues: { ':idValue': id }
    };
    
    const result = await dynamoDB.scan(scanParams).promise();
    
    if (result.Items && result.Items.length > 0) {
      console.log('从DynamoDB扫描到电影:', id);
      return result.Items[0] as Movie;
    }
    
    console.log('在DynamoDB中未找到电影，使用备用数据');
    return sampleMovies.find(m => m.id === id) || null;
  } catch (error) {
    console.error('从DynamoDB获取电影时出错，使用备用数据:', error);
    return sampleMovies.find(m => m.id === id) || null;
  }
}

// 从DynamoDB获取电影列表
async function getMoviesFromDB(category?: string): Promise<Movie[]> {
  if (!TABLE_NAME) {
    console.log('TABLE_NAME环境变量未设置，使用备用数据');
    return category ? sampleMovies.filter(m => m.category === category) : sampleMovies;
  }

  try {
    let items: any[] = [];
    
    if (category) {
      // 按类别查询
      const result = await dynamoDB.query({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'category = :category',
        ExpressionAttributeValues: { ':category': category }
      }).promise();
      
      items = result.Items || [];
      console.log(`从DynamoDB获取到${items.length}部${category}类别的电影`);
    } else {
      // 扫描所有电影
      const result = await dynamoDB.scan({
        TableName: TABLE_NAME,
        Limit: 50
      }).promise();
      
      items = result.Items || [];
      console.log(`从DynamoDB扫描到${items.length}部电影`);
    }
    
    if (items.length > 0) {
      return items as Movie[];
    }
    
    console.log('DynamoDB中没有电影数据，使用备用数据');
    return category ? sampleMovies.filter(m => m.category === category) : sampleMovies;
  } catch (error) {
    console.error('从DynamoDB获取电影列表时出错，使用备用数据:', error);
    return category ? sampleMovies.filter(m => m.category === category) : sampleMovies;
  }
}

// 更新DynamoDB中的电影
async function updateMovieInDB(category: string, id: string, updates: any): Promise<Movie | null> {
  if (!TABLE_NAME) {
    console.log('TABLE_NAME环境变量未设置');
    return null;
  }

  try {
    // 映射要更新的字段
    const updatableFields = [
      { key: 'title', name: '#title' },
      { key: 'director', name: '#director' },
      { key: 'year', name: '#year' },
      { key: 'rating', name: '#rating' },
      { key: 'description', name: '#description' },
      { key: 'isAvailable', name: '#isAvailable' },
      { key: 'translations', name: '#translations' }
    ];
    
    let updateExpression = 'SET ';
    const expressionAttributeValues: { [key: string]: any } = {};
    const expressionAttributeNames: { [key: string]: string } = {};
    
    for (const field of updatableFields) {
      if (updates[field.key] !== undefined) {
        updateExpression += `${field.name} = :${field.key}, `;
        expressionAttributeValues[`:${field.key}`] = updates[field.key];
        expressionAttributeNames[field.name] = field.key;
      }
    }
    
    // 检查是否有更新
    if (Object.keys(expressionAttributeValues).length === 0) {
      console.log('没有提供要更新的字段');
      return null;
    }
    
    // 移除最后的逗号和空格
    updateExpression = updateExpression.slice(0, -2);
    
    const params = {
      TableName: TABLE_NAME,
      Key: { category, id },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamoDB.update(params).promise();
    console.log('成功更新DynamoDB中的电影:', id);
    
    return result.Attributes as Movie;
  } catch (error) {
    console.error('更新DynamoDB中的电影时出错:', error);
    return null;
  }
}

// 使用Amazon Translate翻译文本
async function translateText(text: string, targetLanguage: string): Promise<string> {
  if (!text || text.trim() === '') {
    console.log('输入文本为空，无需翻译');
    return '';
  }

  try {
    // 设置翻译参数
    const params = {
      Text: text,
      SourceLanguageCode: 'auto', // 自动检测源语言
      TargetLanguageCode: targetLanguage
    };
    
    console.log(`尝试翻译文本，参数:`, JSON.stringify(params));
    console.log('当前AWS区域:', AWS.config.region);
    
    // 创建一个新的Translate客户端实例，确保区域正确
    const translateService = new AWS.Translate({ 
      apiVersion: '2017-07-01',
      region: process.env.AWS_REGION || 'eu-west-1',
      maxRetries: 3
    });
    
    // 使用promise语法执行翻译
    const result = await translateService.translateText(params).promise();
    
    console.log('翻译成功，源语言:', result.SourceLanguageCode);
    console.log('翻译结果:', result.TranslatedText);
    
    return result.TranslatedText;
  } catch (error: any) {
    console.error('翻译失败:', error);
    console.error('错误类型:', error.name);
    console.error('错误消息:', error.message);
    console.error('错误代码:', error.code);
    console.error('请求ID:', error.requestId);
    
    // 返回格式化的错误消息
    return `翻译失败: ${error.code ? `${error.code} - ` : ''}${error.message || '未知错误'}`;
  }
}

// 处理API事件的主函数
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('收到请求:', JSON.stringify(event, null, 2));
  
  // 处理CORS预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }
  
  try {
    // 获取请求路径和方法
    const path = event.path || '';
    const method = event.httpMethod;
    console.log('处理请求路径:', path, '方法:', method);
    
    // 处理翻译请求 - 检查路径是否以 '/translation' 结尾
    if (path.endsWith('/translation') && method === 'GET') {
      console.log('检测到翻译请求，路径:', path);
      console.log('路径参数:', event.pathParameters);
      
      // 首先尝试从API Gateway的路径参数中获取
      let id = event.pathParameters?.id;
      let category = event.pathParameters?.category;
      
      // 如果无法从pathParameters获取，则尝试从URL路径解析
      if (!id || !category) {
        console.log('从pathParameters未获取到参数，尝试从URL路径解析');
        const pathParts = path.split('/').filter(part => part !== '');
        console.log('路径分解:', pathParts);
        
        // 假设路径格式为 /movies/{category}/{id}/translation
        if (pathParts.length >= 4 && pathParts[0] === 'movies') {
          category = pathParts[1];
          id = pathParts[2];
          console.log('从路径解析出的参数:', { category, id });
        }
      }
      
      const language = event.queryStringParameters?.language || 'en';
      console.log('翻译请求最终参数:', { category, id, language });
      
      if (!category || !id) {
        console.error('无法获取category和id参数');
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: '无效的翻译请求路径，缺少类别或ID参数' })
        };
      }
      
      // 获取电影数据 (getMovieFromDB会返回示例数据如果找不到)
      const movie = await getMovieFromDB(category, id);
      
      // 如果找不到电影返回404
      if (!movie) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: '电影不存在' })
        };
      }
      
      // 检查描述字段是否存在且非空
      if (!movie.description || movie.description.trim() === '') {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            message: '电影描述为空，无需翻译',
            movie: {
              ...movie,
              translated_description: ''
            }
          })
        };
      }
      
      // 检查是否有缓存的翻译
      if (movie.translations && movie.translations[language]) {
        console.log('使用缓存的翻译:', language);
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
      
      try {
        console.log('尝试翻译描述，电影标题:', movie.title);
        console.log('原始描述文本:', movie.description);
        
        // 创建一个新的Translate客户端实例，明确指定区域
        const translateClient = new AWS.Translate({ 
          apiVersion: '2017-07-01',
          region: process.env.AWS_REGION || 'eu-west-1'
        });
        
        // 设置翻译参数
        const translateParams = {
          Text: movie.description,
          SourceLanguageCode: 'auto', // 自动检测源语言
          TargetLanguageCode: language
        };
        
        console.log('翻译参数:', JSON.stringify(translateParams));
        console.log('当前AWS区域:', AWS.config.region);
        
        // 执行翻译请求
        const translateResult = await translateClient.translateText(translateParams).promise();
        
        console.log('翻译服务结果:', JSON.stringify(translateResult));
        const translatedText = translateResult.TranslatedText;
        console.log('翻译成功，源语言:', translateResult.SourceLanguageCode);
        console.log('翻译结果:', translatedText);
        
        // 初始化翻译缓存如果不存在
        if (!movie.translations) {
          movie.translations = {};
        }
        
        // 添加新翻译到缓存
        movie.translations[language] = translatedText;
        
        // 尝试更新数据库，但不等待完成
        try {
          console.log('尝试缓存翻译结果');
          addMovieToDB(movie).catch(err => console.error('缓存翻译时出错:', err));
        } catch (e) {
          console.error('添加翻译缓存时出错:', e);
        }
        
        // 返回翻译结果
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
      } catch (translateError: any) {
        console.error('翻译过程中出错:', translateError);
        console.error('错误类型:', translateError.name);
        console.error('错误消息:', translateError.message);
        console.error('错误代码:', translateError.code);
        console.error('请求ID:', translateError.requestId);
        
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({
            message: '翻译服务出错',
            error: `${translateError.code}: ${translateError.message}`,
            movie: {
              ...movie,
              translated_description: `翻译失败: ${movie.description}`
            }
          })
        };
      }
    }
    
    // 处理GET请求 - 获取电影列表
    if (method === 'GET') {
      // 处理测试翻译端点
      if (path.endsWith('/test-translate')) {
        console.log('检测到测试翻译请求');
        
        const language = event.queryStringParameters?.language || 'en';
        const text = event.queryStringParameters?.text || '这是一个测试文本，用于测试Amazon Translate服务。';
        
        console.log(`测试翻译请求：将文本"${text}"翻译为${language}`);
        
        try {
          // 直接使用AWS.Translate服务进行翻译，避免使用translateText函数
          const translateParams = {
            Text: text,
            SourceLanguageCode: 'auto',
            TargetLanguageCode: language
          };
          
          console.log('翻译参数:', JSON.stringify(translateParams));
          console.log('当前AWS区域:', AWS.config.region);
          
          const translateClient = new AWS.Translate({ 
            apiVersion: '2017-07-01',
            region: process.env.AWS_REGION || 'eu-west-1'
          });
          
          const translateResult = await translateClient.translateText(translateParams).promise();
          console.log('翻译服务结果:', JSON.stringify(translateResult));
          
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
              message: '测试翻译请求成功',
              original: text,
              translated: translateResult.TranslatedText,
              sourceLanguage: translateResult.SourceLanguageCode,
              targetLanguage: language
            })
          };
        } catch (err: any) {
          console.error('测试翻译请求失败:', err);
          console.error('错误类型:', err.name);
          console.error('错误消息:', err.message);
          console.error('错误代码:', err.code);
          console.error('请求ID:', err.requestId);
          
          return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
              message: '测试翻译请求失败',
              error: `${err.code}: ${err.message}`,
              original: text,
              language
            })
          };
        }
      }

      const category = event.queryStringParameters?.category;
      const id = event.queryStringParameters?.id;
      
      // 如果提供了ID，返回单个电影
      if (id) {
        console.log('通过ID查询电影:', id);
        
        // 使用getMovieByIdFromDB函数获取电影
        const movie = await getMovieByIdFromDB(id);
        
        // 如果找不到电影返回404
        if (!movie) {
          return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ message: '电影不存在' })
          };
        }
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ movie })
        };
      }
      
      // 尝试从DynamoDB获取电影
      let movies = await getMoviesFromDB(category);
      
      // 如果从DynamoDB获取失败或没有结果，使用备用数据
      if (movies.length === 0) {
        console.log('从DynamoDB获取电影列表失败或无结果，使用备用数据');
        
        if (category) {
          movies = sampleMovies.filter(m => m.category === category);
        } else {
          movies = sampleMovies;
        }
      }
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ movies })
      };
    }
    
    // 处理POST请求 - 添加新电影
    if (method === 'POST') {
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
        
        // 创建新电影记录
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
          translations: {}
        };
        
        // 尝试保存到DynamoDB
        const saveResult = await addMovieToDB(movie);
        
        return {
          statusCode: 201,
          headers: corsHeaders,
          body: JSON.stringify({ 
            message: saveResult ? '电影成功添加到数据库' : '电影已创建但未能保存到数据库', 
            movie 
          })
        };
      } catch (parseError) {
        console.error('解析请求体时出错:', parseError);
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: '无效的请求体格式' })
        };
      }
    }
    
    // 处理PUT请求 - 更新电影
    if (method === 'PUT') {
      const category = event.pathParameters?.category;
      const id = event.pathParameters?.id;
      
      if (!category || !id) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: '缺少类别或ID参数' })
        };
      }
      
      try {
        const requestBody = JSON.parse(event.body || '{}');
        
        // 检查电影是否存在
        let movie = await getMovieFromDB(category, id);
        
        // 如果在DynamoDB中找不到，检查示例数据
        if (!movie) {
          const sampleMovie = sampleMovies.find(m => m.id === id && m.category === category);
          movie = sampleMovie || null;
          
          if (!movie) {
            return {
              statusCode: 404,
              headers: corsHeaders,
              body: JSON.stringify({ message: '电影不存在' })
            };
          }
          
          // 如果找到示例电影，尝试先添加到数据库
          await addMovieToDB(movie);
        }
        
        // 尝试更新电影
        const updatedMovie = await updateMovieInDB(category, id, requestBody);
        
        // 如果更新失败，提供备用更新
        if (!updatedMovie) {
          // 创建和返回一个模拟更新的对象
          const fallbackMovie = {
            ...movie,
            ...requestBody
          };
          
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ 
              message: '电影更新未能保存到数据库，但这是更新后的数据', 
              movie: fallbackMovie 
            })
          };
        }
        
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ 
            message: '电影成功更新', 
            movie: updatedMovie 
          })
        };
      } catch (parseError) {
        console.error('解析请求体时出错:', parseError);
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: '无效的请求体格式' })
        };
      }
    }
    
    // 不支持的HTTP方法
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: `不支持的HTTP方法: ${method}` })
    };
  } catch (error) {
    console.error('处理请求时出错:', error);
    
    // 确保无论发生什么错误，总是返回示例数据
    return {
      statusCode: 200, // 始终返回200
      headers: corsHeaders,
      body: JSON.stringify({ 
        message: '请求处理过程中遇到错误，返回备用数据',
        movies: sampleMovies
      })
    };
  }
}; 