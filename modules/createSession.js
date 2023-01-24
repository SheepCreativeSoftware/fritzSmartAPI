'use-strict';

/**
 * @module createSession
 * @author Marina Egner <marinafcegner@sheepCreativeStudios.de>
 * @copyright Marina Egner 2023
 */
import {calcHash} from './calcHash.js';
import {parseData} from './parseData.js';
import {request} from './request.js';

const createSession = {};

/**
 * Get Challenge Code from login Service of Fritz!OS
 * @async
 * @function
 * @param {Object} connection - connection details
 * @param {String} connection.host - hostname or IP-Address
 * @param {Number} connection.version - version to be used for connection (1 or 2)
 * @param {Boolean} connection.useSSL - true if SSL connection over https should be used
 * @return {Promise<String>} Challenge code
 */
const getChallengeCode = async function({host, version, useSSL}) {
	const response = await request.httpGetRequest({
		host,
		parameters: new URLSearchParams({version}),
		service: 'login_sid.lua',
		useSSL,
	}).
		catch((error) => {
			// If request fails, reject with error message
			return Promise.reject(error);
		});
	const {SessionInfo} = parseData.xmlToJson({xmlData: response});
	return Promise.resolve(SessionInfo.Challenge);
};


/**
 * Creates a function to get json converted data from login Service of Fritz!OS
 * @function
 * @param {Number} version - version to be used for connection (1 or 2)
 */
const getSession = function(version) {
	/**
	 * Login request to Fritz!OS with use of MD5 or PBKDF2 Challenge-Response Process(Requires Fritz!OS 5.50)
	 * @async
	 * @function
	 * @param {Object} connection - connection details
	 * @param {String} connection.host - hostname or IP-Address
	 * @param {String} connection.user - the username for the login
	 * @param {String} connection.challengeResponse - the challengeResponse for the login
	 * @param {Boolean} connection.useSSL - true if SSL connection over https should be used
	 * @returns {Promise<Object>} Response session data as Object
	 */
	return async function ({host, user, challengeResponse, useSSL}) {
		const response = await request.httpGetRequest({
			host,
			parameters: new URLSearchParams({
				response: challengeResponse,
				username: user,
				version,
			}),
			service: 'login_sid.lua',
			useSSL,
		}).
			catch((error) => {
				// If request fails, reject with error message
				return Promise.reject(error);
			});
		return Promise.resolve(parseData.xmlToJson({xmlData: response}));
	};
};

// Define some Magic numbers for the version which is provided to the login service
const version = {
	MD5: 1,
	PBKDF2: 2,
};

/**
 * Login request to Fritz!OS with use of PBKDF2 Challenge-Response Process(Requires Fritz!OS 5.50)
 * @async
 * @function
 * @param {Object} connection - connection details
 * @param {String} connection.host - hostname or IP-Address
 * @param {String} connection.user - the username for the login
 * @param {String} connection.challengeResponse - the Challenge Response for the login
 * @param {Boolean} connection.useSSL - true if SSL connection over https should be used
 * @returns {Promise<Object>} Response session data as Object
 */
const getSessionPbkdf2 = getSession(version.PBKDF2);

/**
 * Login request to Fritz!OS with use of MD5 Challenge-Response Process(Requires Fritz!OS 5.50)
 * @async
 * @function
 * @param {Object} connection - connection details
 * @param {String} connection.host - hostname or IP-Address
 * @param {String} connection.user - the username for the login
 * @param {String} connection.challengeResponse - the Challenge Response for the login
 * @param {Boolean} connection.useSSL - true if SSL connection over https should be used
 * @returns {Promise<Object>} Response session data as Object
 */
const getSessionMd5 = getSession(version.MD5);

/**
 * Login request to Fritz!OS with use of PBKDF2 (Requires Fritz!OS 7.24) or MD5 (Requires Fritz!OS 5.50) Challenge-Response Process.
 * If the Fritz!OS version does not support PBKDF2 then the function automaticly falls back to MD5.
 * @param {Object} connection - connection details
 * @param {String} connection.host - hostname or IP-Address
 * @param {String} connection.user - the username for the login
 * @param {String} connection.password - the password for the login
 * @param {String=} [connection.mode=PBKDF2] - Challenge-Response Process; either 'PBKDF2' (default) or 'MD5'
 * @param {Boolean} [connection.useSSL=false] - true if SSL connection over https should be used (default is false)
 * @returns {Promise<Object>} Response session data as Object
 */
createSession.getSession = async function({host, user, password, mode = 'PBKDF2', useSSL = false}) {
	let processVersion = version.MD5;

	// Force mode if selected
	if(mode === 'PBKDF2') processVersion = version.PBKDF2;

	const challengeCode = await getChallengeCode({
		host,
		useSSL,
		version: processVersion,
	}).
		catch((error) => {
			return Promise.reject(error);
		});

	// PBKDF2 is supported if included
	const supportsPbkdf2 = challengeCode.startsWith('2$');

	if(supportsPbkdf2) {
		const challengeResponse = calcHash.calcPbkdf2Response({
			challengeCode,
			password,
		});
		const sessionInfo = await getSessionPbkdf2({
			challengeResponse,
			host,
			useSSL,
			user,
		}).
			catch((error) => {
				return Promise.reject(error);
			});
		return Promise.resolve(sessionInfo);
	}

	// Otherwise use MD5
	const challengeResponse = calcHash.calcMd5Response({
		challengeCode,
		password,
	});
	const sessionInfo = getSessionMd5({
		challengeResponse,
		host,
		useSSL,
		user,
	}).
		catch((error) => {
			return Promise.reject(error);
		});
	return Promise.resolve(sessionInfo);
};

export {createSession};
