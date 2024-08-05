// export async function main(messages: {type:string, text?:{body:""}, interactive?:{}}) {

//     try {
//     } catch (error) {
//         console.error(error)
//     }

// }

export function prepareTextBody(recepient: string, body: string) {
  let responseBody = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recepient,
    type: "text",
    text: {
      body: body,
    },
  };
  return responseBody;
}

export function prepareReactionBody(
  recepient: string,
  message_id: string,
  emoji: string
) {
  let responseBody = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recepient,
    type: "reaction",
    reaction: {
      message_id: message_id,
      emoji: emoji,
    },
  };
  return responseBody;
}

export async function sendResponse(body: {}, ACCESS_TOKEN: string) {
  try {
    const myHeaders = new Headers();
    myHeaders.append("Authorization", `Bearer ${ACCESS_TOKEN}`);
    myHeaders.append("Content-Type", "application/json");

    const requestOptions = {
      method: "POST",
      headers: myHeaders,
      body: JSON.stringify(body),
      redirect: "follow",
    };

    console.log(JSON.stringify(requestOptions));

    let apiResponse = await fetch(
      "https://graph.facebook.com/v20.0/320800497793511/messages",
      requestOptions
    );

    apiResponse = await apiResponse.json();

    console.log("Response from fetch: ", apiResponse);
  } catch (error) {
    console.log("Error in fetch:");
    console.error(error);
  }
}
