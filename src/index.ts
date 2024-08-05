import { Hono } from "hono";
import { prepareReactionBody, prepareTextBody, sendResponse } from "./main";
import { CloudflareBindings } from "../worker-configuration";

import { createClient } from "@supabase/supabase-js";

type Bindings = {
  [key in keyof CloudflareBindings]: CloudflareBindings[key];
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.text("Whatsapp worker!");
});

app.get("/webhook", (c) => {
  if (
    c.req.query()["hub.mode"] == "subscribe" &&
    c.req.query()["hub.verify_token"] ==
      "da2ab51098fac9efd276209aa6f158508a97518ec9242022ff459c46b2292265"
  )
    return c.text(c.req.query()["hub.challenge"]);
  else {
    console.log("returning 400");
    return c.json({}, 400, {});
  }
});

app.post("/webhook", async (c) => {
  let json = await c.req.json();
  console.log("Incoming webhook: " + JSON.stringify(json) + "\n");
  try {
    json = json.entry[0].changes[0].value.messages[0];
  } catch (error) {
    return c.text("No message");
  }

  const USER_STATUS = await c.env.whatsapp_hono.get(json.from);

  switch (json.type) {
    case "text": {
      const MESSAGE: string = json.text.body;

      if (MESSAGE.toLowerCase() == "hi") {
        console.log("first interaction");
        await sendResponse(
          {
            messaging_product: "whatsapp",
            to: json.from,
            type: "interactive",
            interactive: {
              type: "list",
              body: {
                text: "Buy/Sell",
              },
              action: {
                button: "Select",
                sections: [
                  {
                    title: "Select your requirement",
                    rows: [
                      {
                        id: "get",
                        title: "Find Listings",
                      },
                      {
                        id: "post",
                        title: "Save listing to database",
                      },
                    ],
                  },
                ],
              },
            },
          },
          c.env.ACCESS_TOKEN
        );
      } else if (USER_STATUS == "POST") {
        if (MESSAGE.toLowerCase() == "stop sharing") {
          console.log("Received stop sharing. deleting user status");
          await c.env.whatsapp_hono.delete(json.from);
          let message: {} = prepareTextBody(
            json.from,
            "Thanks for sharing. Data successfully saved to DB"
          );
          await sendResponse(message, c.env.ACCESS_TOKEN);
          // send to user "successfully saved to DB"
        } else {
          console.log("send text contents to AI");
          const ai_messages = {
            messages: [
              {
                role: "system",
                content: `You are a technical assistant who converts user messages to JSON strictly according to this sql schema: 
                  transaction_type VARCHAR(10) NOT NULL,
                  property_type VARCHAR(20) NOT NULL,
                  location VARCHAR(255) NOT NULL,
                  address VARCHAR(255),
                  size_in_sqft INT,
                  corner_plot BOOLEAN DEFAULT FALSE,
                  budget_min INT,
                  budget_max INT,
                  contact_name VARCHAR(255),
                  contact_phone INT,
                  additional_features TEXT,
                
                Make sure that you only return the required JSON, no pretext or post text is needed as your response will be directly saved to JSON object`,
              },
              {
                role: "user",
                content: MESSAGE,
              },
            ],
          };

          // get response as json
          let response = await c.env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct",
            ai_messages
          );

          console.log("Response from AI: ", response);
          try {
            response = JSON.parse(response.response);
          } catch (error) {
            console.log("JSON not correct, resending to AI");
            response = await c.env.AI.run("@cf/meta/llama-3-8b-instruct", {
              prompt: `Please correct the following JSON: ${response}\n return only correctly formatted JSON. Your response will be directly saved to a JSON object. Please revalidate your JSON`,
            });
          }

          try {
            response = JSON.parse(response.response);
          } catch (error) {
            console.log("Invalid JSON");
            return c.json({ error }, 200);
          }
          // save to db
          try {
            const supabaseUrl = "https://vlchsnjgwkhbqycdmryw.supabase.co";
            const supabaseKey = c.env.SUPABASE_KEY || "";
            const supabase = createClient(supabaseUrl, supabaseKey);

            const { data, error } = await supabase
              .from("realestate")
              .insert([response])
              .select();

            console.log("Data from supabase: ", data, ". Error: ", error);
          } catch (error) {
            console.log("Supabase error: ", error);
          }

          // react with ✅ once saved
          await sendResponse(
            prepareReactionBody(json.from, json.id, "✅"),
            c.env.ACCESS_TOKEN
          );
        }
      }
      break;
    }
    case "interactive":
      {
        const RESPONSE = json.interactive.list_reply.id;
        if (RESPONSE == "get") {
          console.log("set user status as GET");
          await sendResponse(
            prepareTextBody(json.from, "Here are your search results: "),
            c.env.ACCESS_TOKEN
          );
          // get details from user
          // fetch accordingly from db
          // return to user as text
        } else if (RESPONSE == "post") {
          // set user status as POST
          await c.env.whatsapp_hono.put(json.from, "POST");
          console.log("Successfully changed user status as POST");
          await sendResponse(
            prepareTextBody(json.from, "Please start sending messages"),
            c.env.ACCESS_TOKEN
          );
          // tell user to start sending messages and stop sending once done
        }
      }
      break;
  }

  return c.json(json, 200, {});
});

export default app;
